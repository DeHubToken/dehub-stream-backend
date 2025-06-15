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
import axios from 'axios';
import { ChatbotMetricsService } from '../services/chatbot-metrics.service';

interface ImageAnalysisJobData {
  userAddress: string;
  conversationId: string;
  imageUrl?: string;
  imageData?: string; // Base64
  prompt?: string;
}

@Injectable()
@Processor('image-analysis')
export class AITasksProcessor {
  private readonly logger = new Logger(AITasksProcessor.name);
  private readonly togetherApiKey: string | undefined;
  private readonly defaultModel: string;

  constructor(
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private chatbotGateway: ChatbotGateway,
    private configService: ConfigService,
    private chatbotMetricsService: ChatbotMetricsService,
  ) {
    this.togetherApiKey = this.configService.get<string>('TOGETHER_API_KEY');
    
    // Get model config
    this.defaultModel = this.configService.get<string>('AI_VISION_MODEL') || 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo';
    
    // Verify that API key is available
    if (!this.togetherApiKey) {
      this.logger.warn('TOGETHER_API_KEY env var is missing - image analysis will not work properly');
    } else {
      this.logger.log('AI Tasks processor initialized with Together AI integration');
    }
  }

  @Process('analyzeImage')
  async analyzeImage(job: Job<ImageAnalysisJobData>): Promise<void> {
    const { userAddress, conversationId, imageUrl, imageData, prompt } = job.data;
    this.logger.debug(`Processing image analysis for user ${userAddress} in conversation ${conversationId}`);

    try {
      // 1. Verify the conversation exists
      const conversation = await this.conversationModel.findById(conversationId);
      if (!conversation) {
        throw new Error(`Conversation with ID ${conversationId} not found`);
      }

      // 2. Create a user message that represents the image analysis request
      const userMessageData: any = {
        conversationId,
        senderAddress: userAddress,
        senderType: MessageSenderType.USER,
        text: `[Image Analysis Request] ${prompt || 'Analyze this image'}`,
      };
      
      // Handle different image sources
      if (imageUrl) {
        userMessageData.imageUrl = imageUrl;
      }
      
      // Include metadata about the request if needed
      if (imageData || prompt) {
        userMessageData.metadata = {
          type: 'image_analysis_request',
          hasImageData: !!imageData,
          prompt: prompt,
        };
      }
      
      const userMessage = new this.chatMessageModel(userMessageData);
      await userMessage.save();

      // 3. Update the conversation's lastMessageAt timestamp using atomic update
      await this.conversationModel.updateOne(
        { _id: conversationId },
        { $set: { lastMessageAt: new Date() } }
      );

      // 4. Perform the analysis with Together AI
      if (!this.togetherApiKey) {
        throw new Error('Together AI API key not configured');
      }

      let analysisResult: string;
      
      // Call Together AI with Llama-3.2-11B-Vision-Instruct-Turbo
      analysisResult = await this.analyzeImageWithTogetherAI(imageUrl, imageData, prompt);
      
      // 5. Save the analysis result to the database
      const aiMessageData: any = {
        conversationId,
        senderAddress: AI_SYSTEM_ADDRESS,
        senderType: MessageSenderType.AI,
        text: analysisResult,
      };
      
      // Link to the request message if supported in the model
      if (userMessage._id) {
        aiMessageData.replyToMessage = userMessage._id;
      }
      
      const aiMessage = new this.chatMessageModel(aiMessageData);
      await aiMessage.save();

      // 6. Send the analysis result back to the client
      this.chatbotGateway.sendAnalysisToClient(userAddress, {
        conversationId: conversationId,
        message: aiMessage,
        analysis: analysisResult,
      });

      this.chatbotMetricsService.incrementImagesAnalyzed();

      this.logger.debug(`Image analysis for conversation ${conversationId} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Error processing image analysis: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined
      );
      
      try {
        // Send error notification to client
        this.chatbotGateway.sendAnalysisErrorToClient(userAddress, {
          conversationId,
          error: 'Failed to analyze image. Please try again.'
        });
        
        // Log the error as a message in the conversation
        const errorMessageData = {
          conversationId,
          senderAddress: AI_SYSTEM_ADDRESS,
          senderType: MessageSenderType.SYSTEM,
          text: `Failed to analyze image. Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
        
        const errorMessage = new this.chatMessageModel(errorMessageData);
        await errorMessage.save();
      } catch (e) {
        this.logger.error('Failed to send error notification', e);
      }
      
      this.chatbotMetricsService.incrementErrors();
      
      // Re-throw the error to allow Bull to mark the job as failed and handle retries
      throw error;
    }
  }

  /**
   * Analyzes an image using Together AI's Llama-3.2-11B-Vision model
   */
  private async analyzeImageWithTogetherAI(imageUrl?: string, imageData?: string, prompt?: string): Promise<string> {
    try {
      const baseUrl = 'https://api.together.xyz/v1/chat/completions';
      
      // Create a much more specific default prompt to control output quality and avoid repetition
      const defaultPrompt = 
        "Please analyze this image in detail and CONCISELY. Explain what is in the image, its key elements, and any text if present. " + 
        "State each piece of information ONLY ONCE and NEVER repeat yourself. " +
        "Your response must be less than 200 words. " +
        "When the analysis is complete, only report what you actually see in the image.";
      
      const userPrompt = prompt || defaultPrompt;
      
      // Prepare message content for Together AI
      let content = [];
      
      // Add the image to content
      if (imageUrl) {
        content = [
          {
            type: "text",
            text: userPrompt
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl
            }
          }
        ];
      } else if (imageData) {
        // Ensure data URI format for base64
        const dataUri = imageData.startsWith('data:') 
          ? imageData 
          : `data:image/jpeg;base64,${imageData}`;
          
        content = [
          {
            type: "text",
            text: userPrompt
          },
          {
            type: "image_url",
            image_url: {
              url: dataUri
            }
          }
        ];
      } else {
        throw new Error('No image provided for analysis');
      }
      
      // Make the API request to Together AI using axios instead of fetch
      const response = await axios.post(
        baseUrl,
        {
          model: this.defaultModel,
          messages: [
            {
              role: "user",
              content: content
            }
          ],
          max_tokens: 400, // Further reduced to avoid rambling
          temperature: 0.3, // Reduced for more focused outputs
          top_p: 0.8, // Focus on most likely tokens
          frequency_penalty: 0.8, // Strongly discourage token repetition
          presence_penalty: 0.6 // Penalize topics that appear repeatedly
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.togetherApiKey}`
          }
        }
      );
      
      // Check response status
      if (response.status !== 200) {
        this.logger.error(`Together AI API error: ${response.status} ${response.statusText}`);
        this.logger.error(`API response: ${JSON.stringify(response.data)}`);
        throw new Error(`Together AI API error: ${response.status}`);
      }
      
      const responseData = response.data;
      
      if (responseData.choices && responseData.choices.length > 0) {
        return responseData.choices[0].message.content;
      } else {
        this.logger.error(`Unexpected API response format: ${JSON.stringify(responseData)}`);
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      this.logger.error(`Error analyzing image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
} 