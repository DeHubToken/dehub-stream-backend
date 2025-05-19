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
  ) {
    try {
      const apiKey = this.configService.get<string>('TOGETHER_API_KEY');
      if (!apiKey) {
        this.logger.warn('TOGETHER_API_KEY not found in environment variables');
        this.logger.warn('Chatbot will not be able to generate responses');
      } else {
        // Initialize LLM with Together API
        this.llm = new ChatOpenAI({
          openAIApiKey: apiKey,
          temperature: 0.7,
          modelName: this.llmModel,
          configuration: { baseURL: "https://api.together.xyz/v1" }
        });

        // Initialize standard prompt template
        this.standardPrompt = ChatPromptTemplate.fromTemplate(`
          You are a helpful assistant at DeHub, a live streaming platform. Help users with their questions and provide information about the platform.
          
          Answer the following question based ONLY on the provided context. 
          If the context doesn't contain the information needed to answer the question, say "I don't have enough information about this topic."
          
          Context:
          {context}
          
          Question:
          {query}
          
          Answer:
        `);

        // Initialize conversational prompt template
        this.conversationalPrompt = ChatPromptTemplate.fromMessages([
          ["system", 
          `You are a helpful assistant at DeHub, a live streaming platform. Help users with their questions and provide information about the platform.
          
          Answer the following question based ONLY on the provided context if relevant. 
          If the context doesn't contain the information needed to answer the question, try to answer based on your knowledge of DeHub.
          Be conversational and use the chat history to understand follow-up questions.
          
          Context from knowledge base:
          {context}`],
          new MessagesPlaceholder("history"),
          ["human", "{query}"],
        ]);
        
        this.logger.log('Message processor initialized with LangChain + Together AI integration');
      }
    } catch (error) {
      this.logger.error('Failed to initialize LLM client', error instanceof Error ? error.stack : undefined);
      this.logger.warn('Chatbot will attempt to continue but may not generate responses');
    }
  }

  @Process()
  async processUserMessage(job: Job<MessageProcessingJobData>): Promise<void> {
    // Create a parent trace for the entire processing job
    const mainRunTree = this.langsmithService.createRunTree({
      name: 'ChatbotMessageProcessor',
      run_type: 'chain',
      inputs: job.data,
      metadata: {
        userAddress: job.data.userAddress,
        conversationId: job.data.conversationId,
      },
      tags: ['chatbot', 'message-processing'],
    });

    if (mainRunTree) {
      await mainRunTree.postRun();
    }

    const { userAddress, conversationId, userMessageId, message } = job.data;
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

      // 3. Fetch conversation history for context
      const conversationHistory = await this.chatMessageModel.find({ 
        conversationId: conversation._id 
      }).sort({ createdAt: -1 }).limit(10).lean();

      // Reverse to get chronological order (oldest first)
      const orderedHistory = [...conversationHistory].reverse();

      // 4. Prepare messages for LLM in LangChain format
      const historyMessages = orderedHistory.map(msg => {
        if (msg.senderType === MessageSenderType.USER) {
          return { type: 'human', content: msg.text };
        } else if (msg.senderType === MessageSenderType.SYSTEM) {
          return { type: 'system', content: msg.text };
        } else {
          return { type: 'ai', content: msg.text };
        }
      });

      // 5. Get RAG context if available - create a child run for RAG retrieval
      let ragContext = '';
      let relevantDocs = [];
      
      const ragRunTree = mainRunTree ? 
        await mainRunTree.createChild({
          name: 'RAG_Retrieval',
          run_type: 'chain',
          inputs: { query: message },
        }) : null;
        
      if (ragRunTree) {
        await ragRunTree.postRun();
      }
      
      if (message && message.trim().length > 0) {
        try {
          if (!this.chromaService) {
            this.logger.warn('ChromaService not available, skipping RAG context');
          } else {
            // Check if the vector collection has documents
            const documentCount = await this.chromaService.getDocumentCount();
            
            if (documentCount === 0) {
              this.logger.debug('No documents in the vector database, skipping RAG context');
            } else {
              relevantDocs = await this.chromaService.similaritySearch(message, 3);
              this.logger.debug(`Relevant docs: ${JSON.stringify(relevantDocs)}`);
              
              if (relevantDocs.length > 0) {
                // Format documents as string
                ragContext = relevantDocs.map((doc, i) => 
                  `[Document ${i+1}]\n${doc.pageContent}`
                ).join('\n\n');
                this.logger.debug(`Added RAG context from ${relevantDocs.length} documents out of ${documentCount} total documents`);
              } else {
                this.logger.debug(`No relevant documents found for RAG among ${documentCount} documents`);
              }
            }
          }
          
          if (ragRunTree) {
            await ragRunTree.end({
              outputs: { 
                context: ragContext,
                documentsFound: relevantDocs.length,
              }
            });
            await ragRunTree.patchRun();
          }
        } catch (error) {
          this.logger.warn(`Error retrieving context from vector store: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Don't let RAG failures stop the process
          ragContext = '';
          
          if (ragRunTree) {
            await ragRunTree.end({
              error: `Error retrieving context: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
            await ragRunTree.patchRun();
          }
        }
      }

      // 7. Generate response with LLM using LangChain
      let aiResponseText;
      const llmRunTree = mainRunTree ? 
        await mainRunTree.createChild({
          name: 'LLM_Generation',
          run_type: 'llm',
          inputs: { 
            context: ragContext,
            history: historyMessages,
            query: message,
          },
          metadata: {
            model: this.llmModel,
          },
        }) : null;
        
      if (llmRunTree) {
        await llmRunTree.postRun();
      }
      
      try {
        if (!this.llm) {
          this.logger.warn('LLM not initialized, using fallback response');
          aiResponseText = "I'm sorry, I can't process your request right now due to configuration issues. Please try again later or contact support.";
        } else {
          // Create a chain with the conversational prompt
          const chain = RunnableSequence.from([
            this.conversationalPrompt,
            this.llm,
            new StringOutputParser(),
          ]);

          // Run the chain
          aiResponseText = await chain.invoke({
            context: ragContext,
            history: historyMessages,
            query: message,
          });
          
          this.logger.debug('Generated AI response successfully using LangChain');
        }
        
        if (llmRunTree) {
          await llmRunTree.end({
            outputs: { response: aiResponseText }
          });
          await llmRunTree.patchRun();
        }
      } catch (error) {
        this.logger.error(`Error generating LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
        aiResponseText = "I'm sorry, I encountered an error while processing your request. Please try again later.";
        
        if (llmRunTree) {
          await llmRunTree.end({
            error: `Error generating response: ${error instanceof Error ? error.message : 'Unknown error'}`,
            outputs: { fallback_response: aiResponseText }
          });
          await llmRunTree.patchRun();
        }
      }
      
      // 8. Save the AI's response to the database
      const aiMessage = new this.chatMessageModel({
        conversationId: conversation._id,
        senderAddress: AI_SYSTEM_ADDRESS,
        senderType: MessageSenderType.AI,
        text: aiResponseText,
      });
      await aiMessage.save();

      // 9. Update the conversation's lastMessageAt timestamp
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // 10. Send the AI response back to the client
      this.chatbotGateway.sendMessageToClient(userAddress, {
        conversationId: conversation._id.toString(),
        message: aiMessage,
      });

      this.logger.debug(`Message ${userMessageId} processed successfully`);
      
      if (mainRunTree) {
        await mainRunTree.end({
          outputs: { success: true, aiMessageId: aiMessage._id.toString() }
        });
        // Note: patchRun() doesn't take parameters in the current LangSmith version
        await mainRunTree.patchRun();
      }
    } catch (error) {
      this.logger.error(`Error processing message ${userMessageId}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
      // In a production app, we might want to retry the job or notify the user of the failure
      
      if (mainRunTree) {
        await mainRunTree.end({
          error: `Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        // Note: patchRun() doesn't take parameters in the current LangSmith version
        await mainRunTree.patchRun();
      }
    }
  }
} 