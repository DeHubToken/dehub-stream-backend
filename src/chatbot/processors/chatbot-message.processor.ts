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
import { ChatOpenAI } from "@langchain/openai";
import { LangSmithService } from '../../tracing/langsmith.service';
import { DeHubChatbotService } from '../services/dehub-chatbot.service';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatbotMetricsService } from '../services/chatbot-metrics.service';

interface MessageProcessingJobData {
  userAddress: string;
  conversationId: string;
  userMessageId: string;
  message: string;
}

@Injectable()
@Processor('chatbot-message-processing')
export class ChatbotMessageProcessor {
  private readonly logger = new Logger(ChatbotMessageProcessor.name);
  private readonly llm: ChatOpenAI;
  private readonly llmModel: string;

  constructor(
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private chatbotGateway: ChatbotGateway,
    private configService: ConfigService,
    private langsmithService: LangSmithService,
    private deHubChatbotService: DeHubChatbotService,
    private chatbotMetricsService: ChatbotMetricsService,
  ) {

    // Initialize LLM for fallback scenarios only
    const apiKey = this.configService.get<string>('TOGETHER_API_KEY');
    this.llmModel = this.configService.get<string>('AI_LLM_MODEL');
    if (apiKey) {
      this.llm = new ChatOpenAI({
        openAIApiKey: apiKey,
        temperature: 0.7,
        modelName: this.llmModel,
        configuration: { baseURL: "https://api.together.xyz/v1" }
      });
      this.logger.log(`LLM model initialized: ${this.llmModel}`);
    } else {
      this.logger.warn('TOGETHER_API_KEY not found, LLM features may not work');
    }
  }

  @Process()
  async processUserMessage(job: Job<MessageProcessingJobData>): Promise<void> {
    const { userAddress, conversationId, userMessageId, message } = job.data;
    
    // Create a tracing run for the entire job
    const workflowType = 'dehub';
    const mainRunTree = await this.langsmithService.createRunTree({
      name: `${workflowType}_processing`,
      run_type: 'chain',
      inputs: { 
        userAddress, 
        conversationId, 
        userMessageId, 
        message,
        processor: workflowType
      },
      metadata: {
        model: this.llmModel,
        workflow: workflowType
      },
    });

    if (mainRunTree) {
      await mainRunTree.postRun();
    }

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

      // 3. Fetch conversation history for context
      const conversationHistory = await this.chatMessageModel.find({ 
        conversationId: conversation._id 
      }).sort({ createdAt: -1 }).limit(10).lean();

      // Reverse to get chronological order (oldest first)
      const orderedHistory = [...conversationHistory].reverse();

      // 4. Convert conversation history to BaseMessage format
      const historyMessages: BaseMessage[] = orderedHistory.slice(0, -1).map(msg => {
        if (msg.senderType === MessageSenderType.USER) {
          return new HumanMessage(msg.text);
        } else {
          return new AIMessage(msg.text);
        }
      });

      // 5. Process with DeHubChatbotService
      let aiResponseText: string;
      
      const processingRunTree = mainRunTree ? 
        await mainRunTree.createChild({
          name: `${workflowType}_workflow`,
          run_type: 'chain',
          inputs: { 
            query: message,
            historyLength: historyMessages.length,
            serviceType: workflowType
          },
        }) : null;
        
      if (processingRunTree) {
        await processingRunTree.postRun();
      }
      
      try {
        if (!this.deHubChatbotService) {
          this.logger.warn('DeHubChatbotService not available, using fallback LLM');
          aiResponseText = await this.fallbackLLMResponse(message, historyMessages);
        } else {
          aiResponseText = await this.deHubChatbotService.processQuery(message, historyMessages);
          this.logger.debug('Generated AI response successfully using DeHub Service');
        }
        
        if (processingRunTree) {
          await processingRunTree.end({
            outputs: { 
              response: aiResponseText,
              workflow: `${workflowType}_success`
            }
          });
          await processingRunTree.patchRun();
        }
      } catch (error) {
        this.logger.error(`Error in ${workflowType} processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Fallback to simple response
        aiResponseText = await this.fallbackLLMResponse(message, historyMessages);
        
        if (processingRunTree) {
          await processingRunTree.end({
            error: `${workflowType} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            outputs: { 
              fallback_response: aiResponseText,
              workflow: 'fallback_llm'
            }
          });
          await processingRunTree.patchRun();
        }
      }
      
      // 6. Save the AI's response to the database
      const aiMessage = new this.chatMessageModel({
        conversationId: conversation._id,
        senderAddress: AI_SYSTEM_ADDRESS,
        senderType: MessageSenderType.AI,
        text: aiResponseText,
      });
      await aiMessage.save();

      // 7. Update the conversation's lastMessageAt timestamp
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // 8. Send the AI response back to the client
      this.chatbotGateway.sendMessageToClient(userAddress, {
        conversationId: conversation._id.toString(),
        message: aiMessage,
      });

      this.chatbotMetricsService.incrementMessagesProcessed();
      this.logger.debug(`Message ${userMessageId} processed successfully with ${workflowType}`);
      
      if (mainRunTree) {
        await mainRunTree.end({
          outputs: { 
            success: true, 
            aiMessageId: aiMessage._id.toString(),
            workflow: `${workflowType}_complete`
          }
        });
        await mainRunTree.patchRun();
      }
    } catch (error) {
      this.logger.error(`Error processing message ${userMessageId}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
      
      if (mainRunTree) {
        await mainRunTree.end({
          error: `Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        await mainRunTree.patchRun();
      }
    }
  }

  /**
   * Fallback LLM response when both services fail
   */
  private async fallbackLLMResponse(message: string, historyMessages: BaseMessage[]): Promise<string> {
    this.logger.debug('Using fallback LLM response');
    
    if (!this.llm) {
      this.chatbotMetricsService.incrementErrors();
      return "I'm sorry, I can't process your request right now due to configuration issues. Please try again later or contact support.";
    }

    try {
      // Simple conversational response without RAG
      const historyText = historyMessages
        .map(msg => `${msg._getType()}: ${msg.content}`)
        .join('\n');

      const prompt = `You are a helpful assistant at DeHub, a live streaming platform. Answer the user's question based on the conversation history and your general knowledge.

Conversation History:
${historyText}

User Question: ${message}

Instructions:
- Be conversational and helpful
- Use your knowledge of live streaming platforms and general topics
- Keep responses concise but complete

Answer:`;

      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      return response.content.toString().trim();
    } catch (error) {
      this.logger.error(`Fallback LLM error: ${error.message}`);
      this.chatbotMetricsService.incrementErrors();
      return "I'm sorry, I encountered an error while processing your request. Please try again later.";
    }
  }
} 