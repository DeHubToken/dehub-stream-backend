import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ChatMessage, ChatMessageDocument, MessageSenderType } from '../../models/ChatMessage';
import { Conversation, ConversationDocument } from '../../models/Conversation';
import { GenerateImageDto } from './dto/generate-image.dto';
import { AnalyzeImageDto } from './dto/analyze-image.dto';
import * as crypto from 'crypto';
import { normalizeAddress as normalizeAddressUtil } from '../../common/util/format';

// Define a constant system address for AI responses
export const AI_SYSTEM_ADDRESS = "0x0000000000000000000000000000000000000000"; // Zero address for AI

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectQueue('chatbot-message-processing') private messageProcessingQueue: Queue,
    @InjectQueue('image-generation') private imageGenerationQueue: Queue,
    @InjectQueue('image-analysis') private imageAnalysisQueue: Queue,
  ) {}

  // Helper for normalization to avoid undefined issues if util returns undefined
  private normalizeAddress(address: string): string {
    const normalized = normalizeAddressUtil(address);
    if (normalized === undefined) {
        // This case should ideally not happen if input address is always a valid string
        this.logger.warn(`Address normalization resulted in undefined for input: ${address}. Using original.`);
        return address; 
    }
    return normalized;
  }

  /**
   * Get or create a conversation for a user
   */
  async getOrCreateConversation(userAddress: string, title?: string): Promise<ConversationDocument> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    // Try to find the most recent non-archived conversation for this user
    const existingConversation = await this.conversationModel.findOne({
      userAddress: normalizedUserAddress,
      isArchived: false,
    }).sort({ lastMessageAt: -1 });

    if (existingConversation) {
      return existingConversation;
    }

    // Create a new conversation if none exists
    return this.createConversation(normalizedUserAddress, title);
  }

  /**
   * Create a new conversation for a user
   */
  async createConversation(userAddress: string, title?: string): Promise<ConversationDocument> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    const newConversation = new this.conversationModel({
      userAddress: normalizedUserAddress,
      title: title || 'New Conversation',
      lastMessageAt: new Date(),
    });

    await newConversation.save();
    this.logger.debug(`Created new conversation ${newConversation._id} for user ${normalizedUserAddress}`);
    
    return newConversation;
  }

  /**
   * Get all conversations for a user
   */
  async getConversationsForUser(userAddress: string): Promise<ConversationDocument[]> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    return this.conversationModel.find({ 
      userAddress: normalizedUserAddress 
    }).sort({ lastMessageAt: -1 });
  }

  /**
   * Get all messages for a conversation
   */
  async getMessagesForConversation(
    userAddress: string, 
    conversationId: string
  ): Promise<ChatMessageDocument[]> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    // First, verify that the conversation belongs to this user
    const conversation = await this.conversationModel.findOne({
      _id: conversationId,
      userAddress: normalizedUserAddress,
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found or not accessible by this user`);
    }

    return this.chatMessageModel.find({
      conversationId
    }).sort({ createdAt: 1 });
  }

  /**
   * Handle incoming messages from users
   * 
   * This method queues the message for processing by the AI
   */
  async handleIncomingMessage(
    userAddress: string, 
    conversationId: string | null, 
    messageText: string,
  ): Promise<{ success: boolean; conversationId: string; messageId: string }> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    
    
    try {
      // Validate message text
      this.validateTextInput(messageText, 'Message text');
      
      // Get and validate conversation
      const conversation = await this.resolveConversation(normalizedUserAddress, conversationId);
        
      // Create and save the user message
      const userMessage = new this.chatMessageModel({
        conversationId: conversation._id,
        senderAddress: normalizedUserAddress,
        senderType: MessageSenderType.USER,
        text: messageText,
      });
      await userMessage.save();
      
      // Update the conversation's lastMessageAt
      await this.updateConversationTimestamp(conversation);
      
      // Queue the message for processing with retry options
      const jobId = `msg-${crypto.randomUUID()}`;
      await this.messageProcessingQueue.add({
        userAddress: normalizedUserAddress,
        conversationId: conversation._id.toString(),
        userMessageId: userMessage._id.toString(),
        message: messageText,
      }, {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds delay
        },
        removeOnComplete: true, // Remove job when completed
        jobId: jobId, // Unique ID for tracing
      });
      
      return {
        success: true,
        conversationId: conversation._id.toString(),
        messageId: userMessage._id.toString(),
      };
    } catch (error) {
      this.logger.error(`Error handling message: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Handle image generation request from a user
   * 
   * This method queues the request for processing by the image generation service
   */
  async requestImageGeneration(
    userAddress: string,
    conversationId: string,
    dto: GenerateImageDto,
  ): Promise<{ success: boolean; conversationId: string }> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    this.logger.log(`Received image generation request from user ${normalizedUserAddress}: ${dto.prompt}`);
    
    try {
      // Validate prompt is not empty
      this.validateTextInput(dto.prompt, 'Image prompt');
      
      // Validate and get the conversation
      const conversation = await this.resolveConversation(normalizedUserAddress, conversationId);
      
      // Create user message for the image request
      const userMessage = new this.chatMessageModel({
        conversationId: conversation._id,
        senderAddress: normalizedUserAddress,
        senderType: MessageSenderType.USER,
        text: `[Image Request] ${dto.prompt}`,
        metadata: { 
          type: 'image_request',
          prompt: dto.prompt,
          style: dto.style,
        }
      });
      await userMessage.save();
      
      // Update conversation timestamp
      await this.updateConversationTimestamp(conversation);
      
      // Queue the image generation request with retry options
      const jobId = `img-${crypto.randomUUID()}`;
      await this.imageGenerationQueue.add({
        userAddress: normalizedUserAddress,
        conversationId: conversation._id.toString(),
        userMessageId: userMessage._id.toString(),
        prompt: dto.prompt,
        style: dto.style,
      }, {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds delay
        },
        removeOnComplete: true, // Remove job when completed
        jobId: jobId, // Unique ID for tracing
      });
      
      return {
        success: true,
        conversationId: conversation._id.toString(),
      };
    } catch (error) {
      this.logger.error(`Error handling image generation request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle image analysis request from a user
   * 
   * This method queues the request for processing by the image analysis service
   */
  async requestImageAnalysis(
    userAddress: string,
    dto: AnalyzeImageDto,
  ): Promise<{ success: boolean; conversationId: string }> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    this.logger.log(`Received image analysis request from user ${normalizedUserAddress} for conversation ${dto.conversationId}`);
    
    try {
      // Validate and get the conversation
      const conversation = await this.validateAndGetConversation(normalizedUserAddress, dto.conversationId);
      
     // Update conversation timestamp
     await this.updateConversationTimestamp(conversation);
     
      // Queue the image analysis request with retry options
      const jobId = `analysis-${crypto.randomUUID()}`;
      await this.imageAnalysisQueue.add('analyzeImage', {
        userAddress: normalizedUserAddress,
        conversationId: conversation._id.toString(),
        imageUrl: dto.imageUrl,
        imageData: dto.imageData,
        prompt: dto.prompt,
      }, {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds delay
        },
        removeOnComplete: true, // Remove job when completed
        jobId: jobId, // Unique ID for tracing
      });
      
      return {
        success: true,
        conversationId: conversation._id.toString(),
      };
    } catch (error) {
      this.logger.error(`Error queuing image analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate that input text is not empty or whitespace-only
   * @param text The text to validate
   * @param fieldName Name of the field for error message
   */
  private validateTextInput(text: string, fieldName: string): void {
    if (!text || text.trim() === '') {
      throw new BadRequestException(`${fieldName} cannot be empty or contain only whitespace`);
    }
  }

  /**
   * Resolve and validate a conversation for a user
   * @param userAddress The address of the user
   * @param conversationId Optional conversation ID
   * @returns The resolved conversation document
   */
  private async resolveConversation(
    userAddress: string,
    conversationId: string | null,
  ): Promise<ConversationDocument> {
    if (conversationId) {
      return await this.validateAndGetConversation(userAddress, conversationId);
    } else {
      // If no conversationId provided, find the most recent active conversation
      const existingConversation = await this.conversationModel.findOne({
        userAddress,
        isArchived: false,
      }).sort({ lastMessageAt: -1 });
      
      // If no active conversation exists, create a new one
      return existingConversation || await this.createConversation(userAddress);
    }
  }

  /**
   * Update a conversation's lastMessageAt timestamp
   * @param conversation The conversation to update
   */
  private async updateConversationTimestamp(conversation: ConversationDocument): Promise<void> {
    conversation.lastMessageAt = new Date();
    await conversation.save();
  }
  
  /**
   * Validate that a conversation exists and belongs to the given user
   */
  private async validateAndGetConversation(
    userAddress: string, 
    conversationId: string
  ): Promise<ConversationDocument> {
    const normalizedUserAddress = this.normalizeAddress(userAddress);
    const conversation = await this.conversationModel.findOne({
      _id: conversationId,
      userAddress: normalizedUserAddress,
    });
    
    if (!conversation) {
      throw new NotFoundException(`Conversation not found or not accessible by this user`);
    }
    
    return conversation;
  }
} 