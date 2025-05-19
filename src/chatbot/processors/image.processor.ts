import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bull';
import { Model } from 'mongoose';
import { ChatMessage, ChatMessageDocument, MessageSenderType } from '../../../models/ChatMessage';
import { Conversation, ConversationDocument } from '../../../models/Conversation';
import { ChatbotGateway } from '../chatbot.gateway';
import { AI_SYSTEM_ADDRESS } from '../chatbot.service';
import { ConfigService } from '@nestjs/config';
import { CdnService } from '../../cdn/cdn.service';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

interface ImageGenerationJobData {
  userAddress: string;
  conversationId: string;
  userMessageId: string;
  prompt: string;
  style?: string;
}

@Injectable()
@Processor('image-generation')
export class ImageProcessor {
  private readonly logger = new Logger(ImageProcessor.name);
  private readonly isProd: boolean;
  private readonly localImagesDir: string;
  private readonly apiKey: string | undefined;

  constructor(
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private chatbotGateway: ChatbotGateway,
    private configService: ConfigService,
    private cdnService: CdnService,
  ) {
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
    this.localImagesDir = path.join(process.cwd(), 'docs', 'images');
    this.apiKey = this.configService.get<string>('TOGETHER_API_KEY');
    
    // Ensure local images directory exists in development mode
    if (!this.isProd && !fs.existsSync(this.localImagesDir)) {
      fs.mkdirSync(this.localImagesDir, { recursive: true });
      this.logger.log(`Created local images directory at: ${this.localImagesDir}`);
    }
    
    // Verify that API key is available
    if (!this.apiKey) {
      throw new Error('TOGETHER_API_KEY env var is required for image generation');
    } else {
      this.logger.log('Image processor initialized with Together AI integration');
    }
  }

  @Process()
  async generateImage(job: Job<ImageGenerationJobData>): Promise<void> {
    const { userAddress, conversationId, userMessageId, prompt, style } = job.data;
    this.logger.debug(`Processing image generation for user ${userAddress} in conversation ${conversationId}`);

    try {
      // 1. Fetch the user's message to ensure it exists
      const userMessage = await this.chatMessageModel.findById(userMessageId);
      if (!userMessage) {
        throw new Error(`User message with ID ${userMessageId} not found`);
      }

      // 2. Fetch the conversation to ensure it exists
      const conversation = await this.conversationModel.findById(conversationId);
      if (!conversation) {
        throw new Error(`Conversation with ID ${conversationId} not found`);
      }

      // 3. Check if API key is available
      if (!this.apiKey) {
        throw new Error('Together AI API key not found');
      }

      let enhancedPrompt = prompt;
      if (style) {
        enhancedPrompt = `${prompt} (style: ${style})`;
      }

      // 4. Generate the image using Together AI's FLUX.1 model
      const imageData = await this.generateImageWithTogetherAI(enhancedPrompt);
      
      if (!imageData) {
        throw new Error('Failed to generate image');
      }
      
      let imageUrl: string;
      
      // 5. Save the image based on environment
      if (this.isProd) {
        // In production, upload to S3
        const userSlug = userAddress.slice(0, 8); // First 8 chars of address
        const slug = `images/${userSlug}/${conversationId}`;
        const filename = `image_${Date.now()}.png`;
        
        // Upload to S3
        imageUrl = await this.cdnService.uploadFile(imageData, slug, filename);
      } else {
        // In development, save to local filesystem
        const userFolder = path.join(this.localImagesDir, userAddress.slice(0, 8));
        if (!fs.existsSync(userFolder)) {
          fs.mkdirSync(userFolder, { recursive: true });
        }
        
        const convFolder = path.join(userFolder, conversationId);
        if (!fs.existsSync(convFolder)) {
          fs.mkdirSync(convFolder, { recursive: true });
        }
        
        const filename = `image_${Date.now()}.png`;
        const filePath = path.join(convFolder, filename);
        
        // Write image to disk
        await fs.promises.writeFile(filePath, imageData);
        
        // Generate a URL-like path for local development
        // This should be accessible if you have a static file server pointing to your docs folder
        imageUrl = `/docs/images/${userAddress.slice(0, 8)}/${conversationId}/${filename}`;
        this.logger.debug(`Image saved locally at: ${filePath}`);
      }

      // 6. Save the AI's response to the database as a new message
      const aiMessage = new this.chatMessageModel({
        conversationId: conversation._id,
        senderAddress: AI_SYSTEM_ADDRESS,
        senderType: MessageSenderType.AI,
        text: `Generated image for prompt: "${prompt}"${style ? ` (style: ${style})` : ''}`,
        imageUrl: imageUrl,
      });
      await aiMessage.save();

      // 7. Update the conversation's lastMessageAt timestamp
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // 8. Send the image result back to the client
      this.chatbotGateway.sendImageReadyToClient(userAddress, {
        conversationId: conversation._id.toString(),
        imageUrl: imageUrl,
        prompt: prompt
      });

      // 9. Also send a regular message notification with the AI message
      this.chatbotGateway.sendMessageToClient(userAddress, {
        conversationId: conversation._id.toString(),
        message: aiMessage,
      });

      this.logger.debug(`Image generation for message ${userMessageId} processed successfully`);
    } catch (error) {
      this.logger.error(
        `Error processing image generation for message ${userMessageId}: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined
      );
      
      try {
        // Send error notification to client
        this.chatbotGateway.sendImageErrorToClient(userAddress, {
          conversationId,
          error: 'Failed to generate image. Please try again.'
        });
        
        // Log the error as a message in the conversation
        const errorMessage = new this.chatMessageModel({
          conversationId,
          senderAddress: AI_SYSTEM_ADDRESS,
          senderType: MessageSenderType.SYSTEM,
          text: `Failed to generate image for prompt: "${prompt}". Please try again.`,
        });
        await errorMessage.save();
        
        // Also send as regular message
        this.chatbotGateway.sendMessageToClient(userAddress, {
          conversationId,
          message: errorMessage,
        });
      } catch (e) {
        this.logger.error('Failed to send error notification', e);
      }
    }
  }

  /**
   * Generates an image using Together AI's FLUX.1 model
   * @param prompt The prompt for image generation
   * @returns Image buffer
   */
  private async generateImageWithTogetherAI(prompt: string): Promise<Buffer> {
    try {
      const baseUrl = 'https://api.together.xyz/v1/images/generations';
      
      // Use fetch to directly call the API
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'black-forest-labs/FLUX.1-schnell-Free',
          prompt: prompt,
          steps: 4, // Steps must be between 1 and 4
          n: 1 // Generate 1 image
        })
      });
      
      if (!response.ok) {
        this.logger.error(`API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        this.logger.error(`API response: ${errorText}`);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.data && responseData.data.length > 0 && responseData.data[0].url) {
        // Download the image from the provided URL
        const imageUrl = responseData.data[0].url;
        this.logger.debug(`Downloading image from URL: ${imageUrl}`);
        
        // Use axios to download the image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        return Buffer.from(imageResponse.data);
      } else {
        this.logger.error(`Unexpected API response format: ${JSON.stringify(responseData)}`);
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      this.logger.error(`Error generating image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
} 