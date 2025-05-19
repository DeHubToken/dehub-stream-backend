import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ChatMessage, ChatMessageDocument, MessageSenderType } from '../../models/ChatMessage';
import { Conversation, ConversationDocument } from '../../models/Conversation';

// Define a constant system address for AI responses
export const AI_SYSTEM_ADDRESS = "0x0000000000000000000000000000000000000000"; // Zero address for AI

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectQueue('chatbot-message-processing') private messageProcessingQueue: Queue,
  ) {}

  /**
   * Get or create a conversation for a user
   */
  async getOrCreateConversation(userAddress: string, title?: string): Promise<ConversationDocument> {
    // Try to find the most recent non-archived conversation for this user
    const existingConversation = await this.conversationModel.findOne({
      userAddress,
      isArchived: false,
    }).sort({ lastMessageAt: -1 });

    if (existingConversation) {
      return existingConversation;
    }

    // Create a new conversation if none exists
    return this.createConversation(userAddress, title);
  }

  /**
   * Create a new conversation for a user
   */
  async createConversation(userAddress: string, title?: string): Promise<ConversationDocument> {
    const newConversation = new this.conversationModel({
      userAddress,
      title: title || 'New Conversation',
      lastMessageAt: new Date(),
    });

    await newConversation.save();
    this.logger.debug(`Created new conversation ${newConversation._id} for user ${userAddress}`);
    
    return newConversation;
  }

  /**
   * Get all conversations for a user
   */
  async getConversationsForUser(userAddress: string): Promise<ConversationDocument[]> {
    return this.conversationModel.find({ 
      userAddress 
    }).sort({ lastMessageAt: -1 });
  }

  /**
   * Get all messages for a conversation
   */
  async getMessagesForConversation(
    userAddress: string, 
    conversationId: string
  ): Promise<ChatMessageDocument[]> {
    // First, verify that the conversation belongs to this user
    const conversation = await this.conversationModel.findOne({
      _id: conversationId,
      userAddress,
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
    this.logger.log(`Received message from user ${userAddress}: ${messageText}`);
    
    try {
      // Validate message text is not empty or whitespace-only
      if (!messageText || messageText.trim() === '') {
        throw new BadRequestException('Message text cannot be empty or contain only whitespace');
      }
      
      let conversation: ConversationDocument;
      
      // If the user specified a conversationId, use that
      if (conversationId) {
        conversation = await this.validateAndGetConversation(userAddress, conversationId);
      } else {
        // If no conversationId provided, find the most recent active conversation
        const existingConversation = await this.conversationModel.findOne({
          userAddress,
          isArchived: false,
        }).sort({ lastMessageAt: -1 });
        
        // If no active conversation exists, create a new one
        conversation = existingConversation || await this.createConversation(userAddress);
      }
        
      // Create and save the user message
      const userMessage = new this.chatMessageModel({
        conversationId: conversation._id,
        senderAddress: userAddress,
        senderType: MessageSenderType.USER,
        text: messageText,
      });
      await userMessage.save();
      
      // Update the conversation's lastMessageAt
      conversation.lastMessageAt = new Date();
      await conversation.save();
      
      // Queue the message for processing
      await this.messageProcessingQueue.add({
        userAddress,
        conversationId: conversation._id.toString(),
        userMessageId: userMessage._id.toString(),
        message: messageText,
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
   * Validate that a conversation exists and belongs to the given user
   */
  private async validateAndGetConversation(
    userAddress: string, 
    conversationId: string
  ): Promise<ConversationDocument> {
    const conversation = await this.conversationModel.findOne({
      _id: conversationId,
      userAddress,
    });
    
    if (!conversation) {
      throw new NotFoundException(`Conversation not found or not accessible by this user`);
    }
    
    return conversation;
  }
} 