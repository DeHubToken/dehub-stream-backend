import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { LangSmithService } from '../../tracing/langsmith.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DeHubChatbotService {
  private readonly logger = new Logger(DeHubChatbotService.name);
  private readonly llm: ChatOpenAI;
  private readonly deHubKnowledgeBase: string;


  constructor(
    private configService: ConfigService,
    private langsmithService: LangSmithService,
  ) {
    // Initialize LLM
    const apiKey = this.configService.get<string>('TOGETHER_API_KEY');
    if (!apiKey) {
      this.logger.error('TOGETHER_API_KEY not found in environment variables');
      throw new Error('Chatbot DeHub service misconfigured: TOGETHER_API_KEY missing');
    }

    const model = this.configService.get<string>('AI_LLM_MODEL');
    if (!model) {
      this.logger.error('LLM_MODEL not found in environment variables');
      throw new Error('Chatbot DeHub service misconfigured: LLM_MODEL missing');
    }

    this.llm = new ChatOpenAI({
      openAIApiKey: apiKey,
      temperature: 0.7,
      modelName: model,
      configuration: { baseURL: "https://api.together.xyz/v1" }
    });

    // Load DeHub knowledge base from static file
    try {
      const knowledgeBasePath = path.resolve(process.cwd(), 'docs', 'dehub.md');
      this.deHubKnowledgeBase = fs.readFileSync(knowledgeBasePath, 'utf8');
      this.logger.log(`DeHub knowledge base loaded successfully (${this.deHubKnowledgeBase.length} characters)`);
    } catch (error) {
      this.logger.error(`Failed to load DeHub knowledge base: ${error.message}`);
      throw new Error('DeHub knowledge base file not found at docs/dehub.md');
    }

    this.logger.log('Chatbot DeHub service initialized successfully');
  }

  /**
   * Main entry point for Chatbot DeHub query processing
   */
  async processQuery(query: string, conversationHistory: BaseMessage[]): Promise<string> {
    try {
      this.logger.debug(`Processing query with Chatbot DeHub approach: ${query}`);

      // Step 1: Quick relevance check
      const isDeHubRelated = await this.isDeHubRelated(query);
      
      if (isDeHubRelated) {
        // Step 2: Generate response with full context
        return this.generateWithFullContext(query, conversationHistory);
      } else {
        // Step 3: Handle non-DeHub queries
        return this.generateNonDeHubResponse(query, conversationHistory);
      }
    } catch (error) {
      this.logger.error(`Error in Chatbot DeHub processing: ${error.message}`);
      throw error;
    }
  }

  /**
   * Quick DeHub relevance check using simple LLM call
   */
  private async isDeHubRelated(query: string): Promise<boolean> {
    const prompt = `TASK: Determine if this query requires DeHub platform information.

DeHub is a decentralized streaming platform with:
- Live streaming and video content
- Cryptocurrency payments and NFTs  
- Creator monetization tools
- Chat and messaging systems
- Token-gated content and subscriptions

QUERY: "${query}"

DEHUB-RELATED (answer YES):
- Platform features, streaming, payments, tokens
- Technical issues with DeHub functionality
- Creator tools and monetization
- Platform policies and guidelines

NOT DEHUB-RELATED (answer NO):
- General greetings and small talk
- Unrelated topics (cooking, music, general tech)
- Personal questions about the AI
- Topics outside streaming/creator economy

CRITICAL: Answer ONLY with "YES" or "NO" - no other text.`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const decision = response.content.toString().trim().toUpperCase();
      const isRelated = decision.includes('YES');
      
      this.logger.debug(`Relevance check: "${query}" -> ${isRelated ? 'DeHub-related' : 'Not DeHub-related'}`);
      return isRelated;
    } catch (error) {
      this.logger.error(`Relevance check error: ${error.message}`);
      // Default to false to avoid unnecessary costs
      return false;
    }
  }

  /**
   * Generate response with full DeHub knowledge base context
   */
  private async generateWithFullContext(query: string, conversationHistory: BaseMessage[]): Promise<string> {
    const historyText = conversationHistory
      .map(msg => `${msg._getType() === 'human' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const prompt = `You are a helpful DeHub platform assistant. Use the knowledge base to provide accurate answers.

DEHUB KNOWLEDGE BASE:
${this.deHubKnowledgeBase}

CONVERSATION HISTORY:
${historyText}

USER QUERY: ${query}

RESPONSE GUIDELINES:
- Use knowledge base for accurate, specific information
- Be conversational and helpful
- Keep responses concise but comprehensive (under 200 words)
- Reference specific features, policies, or processes when relevant
- Use emojis sparingly and appropriately
- DO NOT add translations or explanatory notes
- DO NOT use phrases like "Based on the knowledge base above"
- Answer directly and naturally

Provide your DeHub answer:`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const result = response.content.toString().trim();
      
      this.logger.debug('Generated response with full DeHub context successfully');
      return result;
    } catch (error) {
      this.logger.error(`Full context generation error: ${error.message}`);
      return 'I apologize, but I encountered an error while processing your DeHub-related question. Please try again or contact support if the issue persists.';
    }
  }

  /**
   * Handle non-DeHub queries with redirect to platform features
   */
  private async generateNonDeHubResponse(query: string, conversationHistory: BaseMessage[]): Promise<string> {
    const historyText = conversationHistory
      .map(msg => `${msg._getType() === 'human' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const prompt = `You are a helpful assistant for DeHub, a decentralized streaming platform. The user has asked a question that is not about DeHub.

CONVERSATION HISTORY:
${historyText}

USER QUERY:
"${query}"

CRITICAL INSTRUCTIONS:
- Be honest and direct - politely decline to answer non-DeHub questions
- Suggest ONE relevant DeHub feature based on the query topic
- Keep response under 40 words
- Use natural, friendly tone
- DO NOT add translations, explanations, or extra text
- DO NOT use phrases like "Sure" or "Of course" 
- DO NOT include parenthetical translations or clarifications

RESPONSE FORMAT: Single paragraph only, no additional formatting.

Respond naturally and redirect to DeHub features:`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const result = response.content.toString().trim();
      
      this.logger.debug('Generated non-DeHub redirect response successfully');
      return result;
    } catch (error) {
      this.logger.error(`Non-DeHub response generation error: ${error.message}`);
      return "I'm here to help with DeHub platform questions! Feel free to ask me about streaming, creator tools, payments, or any other DeHub features. 😊";
    }
  }
} 