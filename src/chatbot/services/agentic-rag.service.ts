import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StateGraph, Annotation, START, END, Send } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChromaService } from '../../embedding/chroma.service';
import { LangSmithService } from '../../tracing/langsmith.service';
import { Document } from '@langchain/core/documents';

// Define state using Annotation
const AgenticRAGState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  query: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  originalLanguage: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => 'en',
  }),
  retrievalNeeded: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  documents: Annotation<Document[]>({
    reducer: (x, y) => y || x,
    default: () => [],
  }),
  documentQuality: Annotation<'good' | 'poor' | 'none'>({
    reducer: (x, y) => y || x,
    default: () => 'none' as const,
  }),
  rewrittenQuery: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  finalResponse: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  // New fields for multi-query parallel RAG
  isMultiQuery: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  subQueries: Annotation<string[]>({
    reducer: (x, y) => y || x,
    default: () => [],
  }),
  subQueryResults: Annotation<{query: string, documents: Document[], quality: string}[]>({
    reducer: (x, y) => x.concat(y || []),
    default: () => [],
  }),
  synthesizedContext: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
});

type AgenticRAGStateType = typeof AgenticRAGState.State;

@Injectable()
export class AgenticRAGService {
  private readonly logger = new Logger(AgenticRAGService.name);
  private readonly llm: ChatOpenAI;
  private readonly workflow: any;

  constructor(
    private configService: ConfigService,
    private chromaService: ChromaService,
    private langsmithService: LangSmithService,
  ) {
    // Initialize LLM
    const apiKey = this.configService.get<string>('TOGETHER_API_KEY');
    if (!apiKey) {
      this.logger.error('TOGETHER_API_KEY not found in environment variables');
      throw new Error('Agentic RAG service misconfigured: TOGETHER_API_KEY missing');
    }

    this.llm = new ChatOpenAI({
      openAIApiKey: apiKey,
      temperature: 0.7,
      modelName: 'deepseek-ai/DeepSeek-V3',
      configuration: { baseURL: "https://api.together.xyz/v1" }
    });

    // Build the workflow
    this.workflow = this.buildWorkflow();
    this.logger.log('Agentic RAG service initialized successfully');
  }

  /**
   * Main entry point for agentic RAG processing
   */
  async processQuery(query: string, conversationHistory: BaseMessage[]): Promise<string> {
    try {
      this.logger.debug(`Processing query with agentic RAG: ${query}`);

      // Step 1: Quick check - is this even DeHub related?
      if (!this.isDehubRelated(query)) {
        this.logger.debug('Query not DeHub-related, generating direct response without translation or retrieval');
        
        // Generate response directly without any translation or retrieval
        const result = await this.workflow.invoke({
          messages: [...conversationHistory, new HumanMessage(query)],
          query,
          originalLanguage: 'unknown', // We don't need to detect language for non-DeHub queries
          retrievalNeeded: false, // Force no retrieval
        }, {
          recursionLimit: 50,
        });
        
        return result.finalResponse || 'I can help you with DeHub platform questions. What would you like to know about live streaming, chat, or other DeHub features?';
      }

      // Step 2: Detect language for DeHub-related queries
      const { translatedQuery, originalLanguage } = await this.translateQueryIfNeeded(query);

      // Step 3: Process with agentic RAG workflow (using translated query if needed)
      const result = await this.workflow.invoke({
        messages: [...conversationHistory, new HumanMessage(translatedQuery)],
        query: translatedQuery,
        originalLanguage,
      }, {
        recursionLimit: 50,
      });
      
      // Step 4: Translate response back to original language if needed
      const finalResponse = result.finalResponse || 'I apologize, but I encountered an issue processing your request.';
      const translatedResponse = await this.translateResponseIfNeeded(finalResponse, originalLanguage);
      
      return translatedResponse;
    } catch (error) {
      this.logger.error(`Error in agentic RAG processing: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build the LangGraph workflow for agentic RAG
   */
  private buildWorkflow() {
    const workflow = new StateGraph(AgenticRAGState)
      .addNode('decisionAgent', this.decisionAgent.bind(this))
      .addNode('queryAnalysisAgent', this.queryAnalysisAgent.bind(this))
      .addNode('decompositionAgent', this.decompositionAgent.bind(this))
      .addNode('retrievalAgent', this.retrievalAgent.bind(this))
      .addNode('parallelRetrievalAgent', this.parallelRetrievalAgent.bind(this))
      .addNode('synthesisAgent', this.synthesisAgent.bind(this))
      .addNode('gradingAgent', this.gradingAgent.bind(this))
      .addNode('rewriteAgent', this.rewriteAgent.bind(this))
      .addNode('generationAgent', this.generationAgent.bind(this));

    // Set entry point
    workflow.addEdge(START, 'decisionAgent');
    
    // Conditional routing from decision agent
    workflow.addConditionalEdges(
      'decisionAgent',
      this.routeAfterDecision.bind(this),
      {
        'retrieve': 'queryAnalysisAgent',
        'generate': 'generationAgent'
      }
    );

    // Conditional routing from query analysis agent
    workflow.addConditionalEdges(
      'queryAnalysisAgent',
      this.routeAfterQueryAnalysis.bind(this),
      {
        'single': 'retrievalAgent',
        'multi': 'decompositionAgent'
      }
    );

    // Decomposition agent routes to parallel retrieval
    workflow.addConditionalEdges(
      'decompositionAgent',
      this.routeToParallelRetrieval.bind(this),
      ['parallelRetrievalAgent']
    );

    // Parallel retrieval results go to synthesis
    workflow.addEdge('parallelRetrievalAgent', 'synthesisAgent');
    
    // Synthesis goes to generation
    workflow.addEdge('synthesisAgent', 'generationAgent');

    // Single query path
    workflow.addEdge('retrievalAgent', 'gradingAgent');
    
    // Conditional routing from grading agent
    workflow.addConditionalEdges(
      'gradingAgent',
      this.routeAfterGrading.bind(this),
      {
        'generate': 'generationAgent',
        'rewrite': 'rewriteAgent'
      }
    );

    workflow.addEdge('rewriteAgent', 'retrievalAgent');
    workflow.addEdge('generationAgent', END);

    return workflow.compile();
  }

  /**
   * Decision Agent: Decides whether retrieval is needed
   */
  private async decisionAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Decision Agent: Evaluating if retrieval is needed');

    const prompt = `<prompt>
  <role>You are a decision agent for DeHub's knowledge retrieval system. DeHub is a live streaming platform with features like streaming, chat, NFTs, payments, and user management.</role>
  
  <task>Analyze the user query and determine if it requires retrieval from DeHub's knowledge base.</task>
  
  <input>
    <query>"${state.query}"</query>
  </input>
  
  <criteria>
    <no_retrieval_cases>
      <case>General greetings: "hello", "hi", "how are you", "good morning"</case>
      <case>Simple conversational responses: "thank you", "thanks", "goodbye", "bye"</case>
      <case>Personal questions about the AI: "who are you", "what can you do"</case>
      <case>Basic expressions of emotion: "wow", "great", "okay", "yes", "no"</case>
      <case>Small talk without seeking specific information</case>
      <case>Questions completely unrelated to DeHub platform (music, cooking, general tech, etc.)</case>
      <case>General how-to questions not related to DeHub features</case>
    </no_retrieval_cases>
    
    <retrieval_needed_cases>
      <case>Live streaming setup, management, or troubleshooting</case>
      <case>Chat and moderation features</case>
      <case>User profile setup and management</case>
      <case>NFT marketplace functionality</case>
      <case>Payment systems and monetization</case>
      <case>DeHub platform policies and guidelines</case>
      <case>Technical issues specific to DeHub platform</case>
      <case>DeHub account management and settings</case>
      <case>Platform-specific features and functionality</case>
    </retrieval_needed_cases>
  </criteria>
  
  <dehub_context>
    <platform>DeHub is a live streaming platform</platform>
    <core_features>Live streaming, Chat, Moderation, NFTs, Payments, User Management</core_features>
    <scope>Only questions related to DeHub platform functionality should trigger retrieval</scope>
  </dehub_context>
  
  <instructions>
    <instruction>Focus specifically on DeHub platform-related queries</instruction>
    <instruction>If the query is about general topics unrelated to DeHub, do not retrieve</instruction>
    <instruction>Consider the intent: does the user need DeHub-specific information?</instruction>
    <instruction>When in doubt about DeHub relevance, prefer NO to avoid unnecessary costs</instruction>
  </instructions>
  
  <output>Respond with just "YES" if DeHub-specific retrieval is needed, "NO" if not needed.</output>
</prompt>`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const decision = response.content.toString().trim().toUpperCase();
      const retrievalNeeded = decision.includes('YES');

      this.logger.debug(`Decision Agent: Retrieval ${retrievalNeeded ? 'needed' : 'not needed'} for query: "${state.query}"`);
      
      return { retrievalNeeded };
    } catch (error) {
      this.logger.error(`Decision Agent error: ${error.message}`);
      // Default to NO retrieval on error to save costs
      return { retrievalNeeded: false };
    }
  }

  /**
   * Quick domain relevance check for DeHub-related keywords
   */
  private isDehubRelated(query: string): boolean {
    const dehubKeywords = [
      // Platform name
      'dehub', 
      // Core features - English
      'live stream', 'livestream', 'streaming', 'stream', 'broadcast',
      'chat', 'message', 'moderation', 'moderator', 
      'nft', 'marketplace', 'payment', 'pay', 'monetization',
      'profile', 'account', 'user', 'follow', 'subscriber', 'subscription',
      // Core features - Turkish  
      'canlı yayın', 'yayın', 'sohbet', 'mesaj', 'moderasyon',
      'profil', 'hesap', 'kullanıcı', 'takip', 'abone', 'ödeme'
    ];
    
    const queryLower = query.toLowerCase();
    const hasDeHubKeyword = dehubKeywords.some(keyword => queryLower.includes(keyword));
    
    this.logger.debug(`Domain check for "${query}": ${hasDeHubKeyword ? 'DeHub-related' : 'Not DeHub-related'}`);
    
    return hasDeHubKeyword;
  }

  /**
   * Query Analysis Agent: Determines if query needs decomposition
   */
  private async queryAnalysisAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Query Analysis Agent: Analyzing query complexity');

    const prompt = `<prompt>
  <role>You are a query analysis agent that determines if a user query contains multiple distinct questions or topics.</role>
  
  <task>Analyze the user query to determine if it should be decomposed into multiple sub-queries for better retrieval.</task>
  
  <input>
    <query>"${state.query}"</query>
  </input>
  
  <analysis_criteria>
    <single_query_indicators>
      <indicator>Query asks about one specific topic or feature</indicator>
      <indicator>Query has a single clear intent</indicator>
      <indicator>Query can be answered with information from one domain</indicator>
      <indicator>Simple how-to questions about one process</indicator>
    </single_query_indicators>
    
    <multi_query_indicators>
      <indicator>Query contains multiple questions separated by "and", "also", "plus"</indicator>
      <indicator>Query asks about different features or processes</indicator>
      <indicator>Query combines unrelated topics</indicator>
      <indicator>Query asks for comparisons between different things</indicator>
      <indicator>Query contains multiple distinct information needs</indicator>
    </multi_query_indicators>
  </analysis_criteria>
  
  <examples>
    <single_examples>
      <example>"How do I start a live stream?"</example>
      <example>"What are the moderation tools available?"</example>
      <example>"How to set up my profile?"</example>
    </single_examples>
    
    <multi_examples>
      <example>"How do I start a live stream and what moderation tools are available?"</example>
      <example>"What are the payment options and how do I set up my profile?"</example>
      <example>"Tell me about live streaming features and NFT marketplace"</example>
    </multi_examples>
  </examples>
  
  <instructions>
    <instruction>Analyze the query structure and content</instruction>
    <instruction>Look for multiple distinct information needs</instruction>
    <instruction>Consider if the query would benefit from parallel retrieval</instruction>
    <instruction>When in doubt, prefer single query for simplicity</instruction>
  </instructions>
  
  <output>Respond with just "SINGLE" for single query, "MULTI" for multi-query.</output>
</prompt>`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const analysis = response.content.toString().trim().toUpperCase();
      const isMultiQuery = analysis.includes('MULTI');

      this.logger.debug(`Query Analysis Agent: Query is ${isMultiQuery ? 'multi-query' : 'single query'}`);
      
      return { isMultiQuery };
    } catch (error) {
      this.logger.error(`Query Analysis Agent error: ${error.message}`);
      // Default to single query on error
      return { isMultiQuery: false };
    }
  }

  /**
   * Decomposition Agent: Breaks down multi-queries into sub-queries
   */
  private async decompositionAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Decomposition Agent: Breaking down multi-query into sub-queries');

    const prompt = `<prompt>
  <role>You are a query decomposition agent that breaks down complex queries into focused sub-queries.</role>
  
  <task>Decompose the user query into 2-4 specific, focused sub-queries that can be processed independently.</task>
  
  <input>
    <query>"${state.query}"</query>
  </input>
  
  <decomposition_guidelines>
    <guideline>Each sub-query should focus on one specific topic or question</guideline>
    <guideline>Sub-queries should be self-contained and clear</guideline>
    <guideline>Maintain the original intent and context</guideline>
    <guideline>Aim for 2-4 sub-queries maximum</guideline>
    <guideline>Each sub-query should be retrievable independently</guideline>
  </decomposition_guidelines>
  
  <examples>
    <example>
      <original>"How do I start a live stream and what moderation tools are available?"</original>
      <decomposed>
        1. "How do I start a live stream on DeHub?"
        2. "What moderation tools are available for live streams?"
      </decomposed>
    </example>
    
    <example>
      <original>"What are the payment options and how do I set up my profile?"</original>
      <decomposed>
        1. "What payment options are available on DeHub?"
        2. "How do I set up my user profile?"
      </decomposed>
    </example>
  </examples>
  
  <instructions>
    <instruction>Identify the distinct topics or questions in the original query</instruction>
    <instruction>Create focused sub-queries for each topic</instruction>
    <instruction>Ensure each sub-query is clear and specific</instruction>
    <instruction>Return only the sub-queries, one per line</instruction>
  </instructions>
  
  <output>Return the sub-queries as a numbered list, one per line.</output>
</prompt>`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const decompositionText = response.content.toString().trim();
      
      // Parse the sub-queries from the response
      const subQueries = decompositionText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          // Remove numbering (1., 2., etc.) and quotes
          return line.replace(/^\d+\.\s*/, '').replace(/^["']|["']$/g, '').trim();
        })
        .filter(query => query.length > 0);

      this.logger.debug(`Decomposition Agent: Created ${subQueries.length} sub-queries: ${JSON.stringify(subQueries)}`);
      
      return { subQueries };
    } catch (error) {
      this.logger.error(`Decomposition Agent error: ${error.message}`);
      // Fallback to original query
      return { subQueries: [state.query] };
    }
  }

  /**
   * Parallel Retrieval Agent: Performs retrieval for a single sub-query
   */
  private async parallelRetrievalAgent(state: AgenticRAGStateType & { query: string }): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug(`Parallel Retrieval Agent: Processing sub-query: "${state.query}"`);

    try {
      const documents = await this.chromaService.similaritySearch(state.query, 3);
      
      // Grade the documents for this sub-query
      const quality = await this.gradeDocuments(state.query, documents);
      
      this.logger.debug(`Parallel Retrieval Agent: Found ${documents.length} documents with quality: ${quality}`);
      
      return {
        subQueryResults: [{
          query: state.query,
          documents,
          quality
        }]
      };
    } catch (error) {
      this.logger.error(`Parallel Retrieval Agent error for query "${state.query}": ${error.message}`);
      return {
        subQueryResults: [{
          query: state.query,
          documents: [],
          quality: 'poor'
        }]
      };
    }
  }

  /**
   * Helper method to grade documents for a specific query
   */
  private async gradeDocuments(query: string, documents: Document[]): Promise<string> {
    if (!documents || documents.length === 0) {
      return 'none';
    }

    const documentsText = documents
      .map((doc, i) => `Document ${i + 1}: ${doc.pageContent}`)
      .join('\n\n');

    const prompt = `<prompt>
  <role>You are a document relevance grader for a knowledge retrieval system.</role>
  
  <task>Evaluate if the retrieved documents are relevant to answer the user's query.</task>
  
  <input>
    <query>"${query}"</query>
    <documents>
${documentsText}
    </documents>
  </input>
  
  <evaluation_criteria>
    <relevant_indicators>
      <indicator>Documents contain information that directly addresses the query</indicator>
      <indicator>Documents are semantically related to what the user is asking</indicator>
      <indicator>Even partial relevance should be considered valuable</indicator>
      <indicator>Documents provide context that could help answer the query</indicator>
    </relevant_indicators>
  </evaluation_criteria>
  
  <instructions>
    <instruction>Analyze each document for relevance to the query</instruction>
    <instruction>Consider both direct and indirect relevance</instruction>
    <instruction>If documents contain ANY relevant information, mark as GOOD</instruction>
    <instruction>Only mark as POOR if documents are completely unrelated</instruction>
  </instructions>
  
  <output>Respond with just "GOOD" if documents are relevant, "POOR" if not relevant.</output>
</prompt>`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const quality = response.content.toString().trim().toUpperCase();
      return quality.includes('GOOD') ? 'good' : 'poor';
    } catch (error) {
      this.logger.error(`Document grading error: ${error.message}`);
      return 'good'; // Default to good to prevent blocking
    }
  }

  /**
   * Retrieval Agent: Performs vector search using ChromaService
   */
  private async retrievalAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Retrieval Agent: Searching for relevant documents');

    try {
      const queryToUse = state.rewrittenQuery || state.query;
      const documents = await this.chromaService.similaritySearch(queryToUse, 3);
      
      this.logger.debug(`Retrieval Agent: Found ${documents.length} documents`);
      
      return { documents };
    } catch (error) {
      this.logger.error(`Retrieval Agent error: ${error.message}`);
      return { documents: [] };
    }
  }

  /**
   * Grading Agent: Evaluates document relevance
   */
  private async gradingAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Grading Agent: Evaluating document relevance');

    if (!state.documents || state.documents.length === 0) {
      return { documentQuality: 'none' };
    }

    // Max retry check - prevent infinite loops
    const maxRetries = 3;
    if (state.retryCount >= maxRetries) {
      this.logger.warn(`Grading Agent: Max retries (${maxRetries}) reached, forcing good quality to prevent infinite loop`);
      return { documentQuality: 'good' };
    }

    const documentsText = state.documents
      .map((doc, i) => `Document ${i + 1}: ${doc.pageContent}`)
      .join('\n\n');

    const prompt = `<prompt>
  <role>You are a document relevance grader for a knowledge retrieval system.</role>
  
  <task>Evaluate if the retrieved documents are relevant to answer the user's query.</task>
  
  <input>
    <query>"${state.query}"</query>
    <documents>
${documentsText}
    </documents>
    <retry_count>${state.retryCount}</retry_count>
  </input>
  
  <evaluation_criteria>
    <relevant_indicators>
      <indicator>Documents contain information that directly addresses the query</indicator>
      <indicator>Documents are semantically related to what the user is asking</indicator>
      <indicator>Even partial relevance should be considered valuable</indicator>
      <indicator>Documents provide context that could help answer the query</indicator>
    </relevant_indicators>
    
    <evaluation_approach>
      <approach>Be more lenient in evaluation - partial relevance is acceptable</approach>
      <approach>Consider indirect relevance and contextual information</approach>
      <approach>Focus on potential usefulness rather than perfect matches</approach>
    </evaluation_approach>
  </evaluation_criteria>
  
  <instructions>
    <instruction>Analyze each document for relevance to the query</instruction>
    <instruction>Consider both direct and indirect relevance</instruction>
    <instruction>If documents contain ANY relevant information, mark as GOOD</instruction>
    <instruction>Only mark as POOR if documents are completely unrelated</instruction>
  </instructions>
  
  <output>Respond with just "GOOD" if documents are relevant, "POOR" if not relevant.</output>
</prompt>`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const quality = response.content.toString().trim().toUpperCase();
      const documentQuality = quality.includes('GOOD') ? 'good' : 'poor';

      this.logger.debug(`Grading Agent: Document quality is ${documentQuality} (retry: ${state.retryCount})`);
      
      return { documentQuality: documentQuality as 'good' | 'poor' };
    } catch (error) {
      this.logger.error(`Grading Agent error: ${error.message}`);
      // Force good quality on error to prevent infinite loops
      return { documentQuality: 'good' };
    }
  }

  /**
   * Rewrite Agent: Improves the query for better retrieval
   */
  private async rewriteAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Rewrite Agent: Improving query for better retrieval');

    // Increment retry counter
    const newRetryCount = (state.retryCount || 0) + 1;
    this.logger.debug(`Rewrite Agent: Retry attempt ${newRetryCount}`);

    const prompt = `<prompt>
  <role>You are a query rewriter specialized in improving search queries for better document retrieval.</role>
  
  <task>The original query didn't return relevant documents. Rewrite it to be more specific and likely to find relevant information.</task>
  
  <input>
    <original_query>"${state.query}"</original_query>
    <retry_attempt>${newRetryCount}</retry_attempt>
  </input>
  
  <rewriting_strategy>
    <approach>Make the query more specific and detailed</approach>
    <approach>Optimize for semantic search compatibility</approach>
    <approach>Clarify what information is needed</approach>
    <approach>Add relevant keywords that might match documents</approach>
    <approach>Consider alternative phrasings of the same concept</approach>
  </rewriting_strategy>
  
  <instructions>
    <instruction>Rewrite the query to improve document retrieval</instruction>
    <instruction>Preserve the original intent and meaning</instruction>
    <instruction>Make it more specific without changing the core question</instruction>
    <instruction>Consider technical terms and synonyms</instruction>
    <instruction>Respond with just the rewritten query, nothing else</instruction>
  </instructions>
  
  <output>Rewritten query:</output>
</prompt>`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const rewrittenQuery = response.content.toString().trim();

      this.logger.debug(`Rewrite Agent: Rewritten query: ${rewrittenQuery}`);
      
      return { 
        rewrittenQuery,
        retryCount: newRetryCount
      };
    } catch (error) {
      this.logger.error(`Rewrite Agent error: ${error.message}`);
      return { 
        rewrittenQuery: state.query,
        retryCount: newRetryCount
      };
    }
  }

  /**
   * Generation Agent: Creates the final response
   */
  private async generationAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Generation Agent: Creating final response');

    let context = '';
    
    // Use synthesized context for multi-query results
    if (state.synthesizedContext && state.synthesizedContext.length > 0) {
      context = state.synthesizedContext;
      this.logger.debug('Generation Agent: Using synthesized context from multi-query results');
    }
    // Fallback to regular documents for single query
    else if (state.documents && state.documents.length > 0 && state.documentQuality === 'good') {
      context = state.documents
        .map((doc, i) => `[Document ${i + 1}]\n${doc.pageContent}`)
        .join('\n\n');
      this.logger.debug('Generation Agent: Using regular document context');
    }

    const conversationHistory = state.messages.slice(0, -1); // All except current query
    const historyText = conversationHistory
      .map(msg => `${msg._getType()}: ${msg.content}`)
      .join('\n');

    const prompt = context 
      ? `<prompt>
  <role>You are a helpful assistant at DeHub, a live streaming platform.</role>
  
  <task>Answer the user's question using the provided context from the knowledge base and conversation history.</task>
  
  <input>
    <conversation_history>
${historyText}
    </conversation_history>
    
    <knowledge_context>
${context}
    </knowledge_context>
    
    <user_question>${state.query}</user_question>
  </input>
  
  <instructions>
    <instruction>Use the knowledge context to provide accurate information</instruction>
    <instruction>Be conversational and helpful in your tone</instruction>
    <instruction>If the context doesn't fully answer the question, combine it with your general knowledge</instruction>
    <instruction>Keep responses concise but complete</instruction>
    <instruction>Reference the context when providing specific facts</instruction>
    <instruction>Maintain consistency with the conversation history</instruction>
    <instruction>If the context contains multiple sections, synthesize information from all relevant sections</instruction>
  </instructions>
  
  <output>Helpful answer:</output>
</prompt>`
      : `<prompt>
  <role>You are a helpful assistant at DeHub, a live streaming platform.</role>
  
  <task>Respond to the user's question. If it's not related to DeHub platform, politely redirect them to DeHub-related topics.</task>
  
  <input>
    <conversation_history>
${historyText}
    </conversation_history>
    
    <user_question>${state.query}</user_question>
    <retrieval_performed>${state.retrievalNeeded ? 'yes' : 'no'}</retrieval_performed>
  </input>
  
  <instructions>
    <instruction>If the question is not related to DeHub platform, politely acknowledge it and redirect to DeHub features</instruction>
    <instruction>Be friendly and helpful while staying focused on DeHub platform</instruction>
    <instruction>Suggest relevant DeHub features that might interest the user</instruction>
    <instruction>Keep responses concise and engaging</instruction>
    <instruction>Maintain a conversational tone</instruction>
  </instructions>
  
  <examples>
    <example>
      <user_query>How do I fix a guitar string?</user_query>
      <response>I appreciate your question about guitar strings! While I'm specialized in helping with DeHub's live streaming platform, I'd love to help you with anything related to streaming, content creation, or our platform features. 

For example, if you're a musician, you might be interested in our live streaming features to showcase your music, or our chat and moderation tools to engage with your audience. Would you like to know more about how to set up a live stream on DeHub? 🎵</response>
    </example>
  </examples>
  
  <output>Helpful response that redirects to DeHub topics:</output>
</prompt>`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const finalResponse = response.content.toString().trim();

      this.logger.debug('Generation Agent: Response created successfully');
      
      return { finalResponse };
    } catch (error) {
      this.logger.error(`Generation Agent error: ${error.message}`);
      return { finalResponse: 'I apologize, but I encountered an error while generating a response. Please try again.' };
    }
  }

  /**
   * Routing logic after decision agent
   */
  private routeAfterDecision(state: AgenticRAGStateType): string {
    return state.retrievalNeeded ? 'retrieve' : 'generate';
  }

  /**
   * Routing logic after grading agent
   */
  private routeAfterGrading(state: AgenticRAGStateType): string {
    return state.documentQuality === 'good' ? 'generate' : 'rewrite';
  }

  /**
   * Routing logic after query analysis agent
   */
  private routeAfterQueryAnalysis(state: AgenticRAGStateType): string {
    return state.isMultiQuery ? 'multi' : 'single';
  }

  /**
   * Routing logic to parallel retrieval using Send API
   */
  private routeToParallelRetrieval(state: AgenticRAGStateType) {
    if (state.subQueries && state.subQueries.length > 0) {
      // Use Send API to create parallel execution for each sub-query
      return state.subQueries.map(subQuery => 
        new Send('parallelRetrievalAgent', { 
          ...state,
          query: subQuery 
        })
      );
    }
    // Fallback to single retrieval if no sub-queries
    return 'retrievalAgent';
  }

  /**
   * Detect if query is in non-English language and translate if needed
   */
  private async translateQueryIfNeeded(query: string): Promise<{ translatedQuery: string; originalLanguage: string }> {
    try {
      // Simple language detection using OpenAI
      const detectionPrompt = `<prompt>
  <role>You are a language detection specialist.</role>
  
  <task>Detect the language of the given text and return the 2-letter ISO language code.</task>
  
  <input>
    <text>"${query}"</text>
  </input>
  
  <instructions>
    <instruction>Analyze the text and identify its primary language</instruction>
    <instruction>Return only the 2-letter ISO code (en, tr, de, fr, etc.)</instruction>
    <instruction>If uncertain, default to 'en'</instruction>
  </instructions>
  
  <output>Language code:</output>
</prompt>`;

      const detectionResponse = await this.llm.invoke([new HumanMessage(detectionPrompt)]);
      const detectedLang = detectionResponse.content.toString().trim().toLowerCase();

      // If already English, no translation needed
      if (detectedLang === 'en') {
        return { translatedQuery: query, originalLanguage: 'en' };
      }

      // Translate to English for RAG processing
      const translationPrompt = `<prompt>
  <role>You are a professional translator specialized in accurate translations.</role>
  
  <task>Translate the given text from ${detectedLang.toUpperCase()} to English.</task>
  
  <input>
    <source_language>${detectedLang.toUpperCase()}</source_language>
    <target_language>English</target_language>
    <text>"${query}"</text>
  </input>
  
  <instructions>
    <instruction>Provide an accurate, natural translation</instruction>
    <instruction>Preserve the original meaning and intent</instruction>
    <instruction>Respond only with the translation, no explanations</instruction>
    <instruction>Maintain the same tone and style</instruction>
  </instructions>
  
  <output>English translation:</output>
</prompt>`;

      const translationResponse = await this.llm.invoke([new HumanMessage(translationPrompt)]);
      const translatedQuery = translationResponse.content.toString().trim();

      this.logger.debug(`Query translated from ${detectedLang} to English: ${query} → ${translatedQuery}`);
      
      return { translatedQuery, originalLanguage: detectedLang };
    } catch (error) {
      this.logger.error(`Translation error: ${error.message}`);
      // Fallback: use original query
      return { translatedQuery: query, originalLanguage: 'en' };
    }
  }

  /**
   * Translate response back to user's original language
   */
  private async translateResponseIfNeeded(response: string, targetLanguage: string): Promise<string> {
    // If target language is English, no translation needed
    if (targetLanguage === 'en') {
      return response;
    }

    try {
      const translationPrompt = `<prompt>
  <role>You are a professional translator specialized in maintaining tone and context in translations.</role>
  
  <task>Translate the assistant's response back to the user's original language.</task>
  
  <input>
    <source_language>English</source_language>
    <target_language>${targetLanguage.toUpperCase()}</target_language>
    <response_text>"${response}"</response_text>
  </input>
  
  <instructions>
    <instruction>Keep the meaning and tone exactly the same</instruction>
    <instruction>Maintain the conversational and helpful style</instruction>
    <instruction>Preserve any technical terms or specific information</instruction>
    <instruction>Ensure natural flow in the target language</instruction>
    <instruction>Respond only with the translated text, no explanations</instruction>
  </instructions>
  
  <output>Translation:</output>
</prompt>`;

      const translationResponse = await this.llm.invoke([new HumanMessage(translationPrompt)]);
      const translatedResponse = translationResponse.content.toString().trim();

      this.logger.debug(`Response translated to ${targetLanguage}: ${response} → ${translatedResponse}`);
      
      return translatedResponse;
    } catch (error) {
      this.logger.error(`Response translation error: ${error.message}`);
      // Fallback: return original response
      return response;
    }
  }

  /**
   * Synthesis Agent: Combines results from parallel sub-queries
   */
  private async synthesisAgent(state: AgenticRAGStateType): Promise<Partial<AgenticRAGStateType>> {
    this.logger.debug('Synthesis Agent: Combining sub-query results');

    if (!state.subQueryResults || state.subQueryResults.length === 0) {
      this.logger.warn('Synthesis Agent: No sub-query results to synthesize');
      return { synthesizedContext: '', documents: [] };
    }

    // Combine all documents from sub-queries
    const allDocuments: Document[] = [];
    const contextSections: string[] = [];

    for (const result of state.subQueryResults) {
      if (result.quality === 'good' && result.documents.length > 0) {
        allDocuments.push(...result.documents);
        
        // Create a context section for this sub-query
        const sectionContent = result.documents
          .map(doc => doc.pageContent)
          .join('\n\n');
        
        contextSections.push(`## Information for: "${result.query}"\n${sectionContent}`);
      }
    }

    // Remove duplicate documents based on content
    const uniqueDocuments = allDocuments.filter((doc, index, self) => 
      index === self.findIndex(d => d.pageContent === doc.pageContent)
    );

    const synthesizedContext = contextSections.join('\n\n---\n\n');

    this.logger.debug(`Synthesis Agent: Combined ${state.subQueryResults.length} sub-query results into ${uniqueDocuments.length} unique documents`);

    return {
      documents: uniqueDocuments,
      synthesizedContext,
      documentQuality: uniqueDocuments.length > 0 ? 'good' : 'poor'
    };
  }
} 