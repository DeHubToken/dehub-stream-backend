import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bull';
import { Model } from 'mongoose';
import { ChatMessage, ChatMessageDocument, MessageSenderType } from '../../../models/ChatMessage';
import { Conversation, ConversationDocument } from '../../../models/Conversation';
import { ChatbotGateway } from '../chatbot.gateway';
import { AI_SYSTEM_ADDRESS } from '../chatbot.service';
import { ChromaService } from '../../embedding/chroma.service';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { LangSmithService } from '../../tracing/langsmith.service';
import { AgenticRAGService } from '../services/agentic-rag.service';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatbotMetricsService } from '../services/chatbot-metrics.service';

interface MessageProcessingJobData {
  userAddress: string;
  conversationId: string;
  userMessageId: string;
  message: string; // User message (for RAG processing)
}

@Injectable()
@Processor('chatbot-message-processing')
export class ChatbotMessageProcessor {
  private readonly logger = new Logger(ChatbotMessageProcessor.name);
  private readonly llm: ChatOpenAI;
  private readonly llmModel: string = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
  private readonly standardPrompt: ChatPromptTemplate;
  private readonly conversationalPrompt: ChatPromptTemplate;

  constructor(
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private chatbotGateway: ChatbotGateway,
    private configService: ConfigService,
    private chromaService: ChromaService,
    private langsmithService: LangSmithService,
    private agenticRAGService: AgenticRAGService,
    private chatbotMetricsService: ChatbotMetricsService,
  ) {
    // Initialize LLM for fallback scenarios only
    const apiKey = this.configService.get<string>('TOGETHER_API_KEY');
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

    // Initialize prompts for fallback scenarios
    this.standardPrompt = ChatPromptTemplate.fromTemplate(`
      You are a helpful AI assistant for DeHub, a live streaming platform.
      Based on the following context and user query, provide a helpful response.
      
      Context: {context}
      Query: {query}
      
      Respond naturally and be helpful. If the context doesn't contain relevant information, 
      use your general knowledge to assist the user.
      
      Response:
    `);

    this.conversationalPrompt = ChatPromptTemplate.fromTemplate(`
      You are a helpful AI assistant for DeHub, a live streaming platform.
      
      Conversation History:
      {history}
      
      Context from knowledge base:
      {context}
      
      User Query: {query}
      
      Instructions:
      - Consider the conversation history for context
      - Use the knowledge base context if relevant
      - Be conversational and helpful
      - Keep responses concise but complete
      
      Response:
    `);
  }

  @Process()
  async processUserMessage(job: Job<MessageProcessingJobData>): Promise<void> {
    const { userAddress, conversationId, userMessageId, message } = job.data;
    
    // Create a tracing run for the entire job
    const mainRunTree = await this.langsmithService.createRunTree({
      name: 'Agentic_RAG_Processing',
      run_type: 'chain',
      inputs: { 
        userAddress, 
        conversationId, 
        userMessageId, 
        message,
        processor: 'agentic'
      },
      metadata: {
        model: this.llmModel,
        workflow: 'agentic_rag'
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

      // 4. Convert conversation history to BaseMessage format for agentic RAG
      const historyMessages: BaseMessage[] = orderedHistory.slice(0, -1).map(msg => {
        if (msg.senderType === MessageSenderType.USER) {
          return new HumanMessage(msg.text);
        } else {
          return new AIMessage(msg.text);
        }
      });

      // 5. Process with Agentic RAG
      let aiResponseText: string;
      
      const agenticRAGRunTree = mainRunTree ? 
        await mainRunTree.createChild({
          name: 'Agentic_RAG_Workflow',
          run_type: 'chain',
          inputs: { 
            query: message,
            historyLength: historyMessages.length,
          },
        }) : null;
        
      if (agenticRAGRunTree) {
        await agenticRAGRunTree.postRun();
      }
      
      try {
        if (!this.agenticRAGService) {
          this.logger.warn('AgenticRAGService not available, using fallback LLM');
          aiResponseText = await this.fallbackLLMResponse(message, historyMessages);
          this.chatbotMetricsService.incrementErrors();
        } else {
          // Use agentic RAG for processing
          aiResponseText = await this.agenticRAGService.processQuery(message, historyMessages);
          this.logger.debug('Generated AI response successfully using Agentic RAG');
        }
        
        if (agenticRAGRunTree) {
          await agenticRAGRunTree.end({
            outputs: { 
              response: aiResponseText,
              workflow: 'agentic_rag_success'
            }
          });
          await agenticRAGRunTree.patchRun();
        }
      } catch (error) {
        this.logger.error(`Error in agentic RAG processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Fallback to simple response
        aiResponseText = await this.fallbackLLMResponse(message, historyMessages);
        
        if (agenticRAGRunTree) {
          await agenticRAGRunTree.end({
            error: `Agentic RAG failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            outputs: { 
              fallback_response: aiResponseText,
              workflow: 'fallback_llm'
            }
          });
          await agenticRAGRunTree.patchRun();
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
      this.logger.debug(`Message ${userMessageId} processed successfully with agentic RAG`);
      
      if (mainRunTree) {
        await mainRunTree.end({
          outputs: { 
            success: true, 
            aiMessageId: aiMessage._id.toString(),
            workflow: 'agentic_rag_complete'
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
   * Fallback LLM response when agentic RAG fails
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