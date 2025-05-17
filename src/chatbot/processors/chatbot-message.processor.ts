import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bull';
import { Model } from 'mongoose';
import { ChatMessage, ChatMessageDocument, MessageSenderType } from '../../../models/ChatMessage';
import { Conversation, ConversationDocument } from '../../../models/Conversation';
import { ChatbotGateway } from '../chatbot.gateway';
import { AI_SYSTEM_ADDRESS } from '../chatbot.service';

interface MessageProcessingJobData {
  userAddress: string;
  conversationId: string;
  userMessageId: string;
}

@Injectable()
@Processor('chatbot-message-processing')
export class ChatbotMessageProcessor {
  private readonly logger = new Logger(ChatbotMessageProcessor.name);

  constructor(
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private chatbotGateway: ChatbotGateway,
  ) {}

  @Process()
  async processUserMessage(job: Job<MessageProcessingJobData>): Promise<void> {
    const { userAddress, conversationId, userMessageId } = job.data;
    this.logger.debug(`Processing message ${userMessageId} from user ${userAddress} in conversation ${conversationId}`);

    try {
      // 1. Fetch the user's message
      const userMessage = await this.chatMessageModel.findById(userMessageId);
      if (!userMessage) {
        throw new Error(`User message with ID ${userMessageId} not found`);
      }

      // 2. Fetch the conversation to ensure it exists
      const conversation = await this.conversationModel.findById(conversationId);
      if (!conversation) {
        throw new Error(`Conversation with ID ${conversationId} not found`);
      }

      // 3. In a real implementation, we would fetch previous messages for context
      // const conversationHistory = await this.chatMessageModel.find({ 
      //   conversationId: conversation._id 
      // }).sort({ createdAt: 1 }).limit(10).lean();

      // 4. For Phase 2, we'll just create a simple mock response
      // In Phase 3+, this would call OpenAI or another provider
      const aiResponseText = `This is a mock AI response to: "${userMessage.text}"`;
      
      // 5. Save the AI's response to the database
      const aiMessage = new this.chatMessageModel({
        conversationId: conversation._id,
        senderAddress: AI_SYSTEM_ADDRESS, // Using the AI system address instead of user's address
        senderType: MessageSenderType.AI,
        text: aiResponseText,
      });
      await aiMessage.save();

      // 6. Update the conversation's lastMessageAt timestamp
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // 7. Send the AI response back to the client
      this.chatbotGateway.sendMessageToClient(userAddress, {
        conversationId: conversation._id.toString(),
        message: aiMessage,
      });

      this.logger.debug(`Message ${userMessageId} processed successfully`);
    } catch (error) {
      this.logger.error(`Error processing message ${userMessageId}:`, error.stack);
      // In a production app, we might want to retry the job or notify the user of the failure
    }
  }
} 