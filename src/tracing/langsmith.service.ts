import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { traceable } from 'langsmith/traceable';
import { wrapOpenAI } from 'langsmith/wrappers';
import { RunTree } from 'langsmith/run_trees';
import { type ChatOpenAI } from '@langchain/openai';

/**
 * LangSmithService provides utilities for tracing and monitoring LLM operations.
 * It integrates with the LangSmith platform for enhanced observability.
 */
@Injectable()
export class LangSmithService implements OnModuleInit {
  private readonly logger = new Logger(LangSmithService.name);
  private isEnabled = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    // Check if LangSmith tracing is enabled via environment variables
    const isTracingEnabled = this.configService.get<string>('LANGCHAIN_TRACING_V2') === 'true';
    const apiKey = this.configService.get<string>('LANGCHAIN_API_KEY');
    
    if (isTracingEnabled && apiKey) {
      this.isEnabled = true;
      this.logger.log('LangSmith tracing is enabled');
    } else {
      this.logger.warn(
        'LangSmith tracing is disabled. Set LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY to enable.',
      );
    }
  }

  /**
   * Wraps a function with LangSmith tracing
   * 
   * @param fn Function to trace
   * @param options Tracing options
   * @returns Traced function
   */
  traceFunction<T extends (...args: any[]) => any>(
    fn: T,
    options: {
      name?: string;
      metadata?: Record<string, any>;
      tags?: string[];
      project?: string;
      run_type?: 'llm' | 'chain' | 'tool';
    },
  ): T {
    if (!this.isEnabled) {
      return fn;
    }
    
    return traceable(fn, {
      name: options.name || fn.name,
      metadata: options.metadata || {},
      tags: options.tags || [],
      project_name: options.project || this.configService.get<string>('LANGCHAIN_PROJECT') || 'default',
      run_type: options.run_type || 'chain',
    }) as T;
  }

  /**
   * Creates a run tree for manual tracing when needed
   * 
   * @param options RunTree configuration options
   * @returns RunTree instance or null if tracing is disabled
   */
  createRunTree(options: {
    name: string;
    run_type?: 'llm' | 'chain' | 'tool';
    inputs?: Record<string, any>;
    metadata?: Record<string, any>;
    tags?: string[];
  }) {
    if (!this.isEnabled) {
      return null;
    }
    
    return new RunTree({
      name: options.name,
      run_type: options.run_type || 'chain',
      inputs: options.inputs || {},
      metadata: options.metadata || {},
      tags: options.tags || [],
      project_name: this.configService.get<string>('LANGCHAIN_PROJECT') || 'default',
    });
  }

  /**
   * Wraps the OpenAI client with LangSmith tracing
   * Note: This is a simplified method that works for most use cases with LangChain
   * 
   * @param client LangChain OpenAI client instance
   * @returns The same client instance but with tracing enabled
   */
  wrapLangChainOpenAI(client: ChatOpenAI): ChatOpenAI {
    if (!this.isEnabled) {
      return client;
    }
    
    // For LangChain instances, tracing should happen automatically
    // when environment variables are set, but we log for verification
    this.logger.debug('LangChain OpenAI client will be traced via environment variables');
    return client;
  }

  /**
   * Wraps any SDK client with tracing
   * Use this when you have a direct SDK integration
   * 
   * @param client The client to wrap
   * @returns The wrapped client or the original if tracing is disabled
   */
  wrapSDK<T>(client: T): T {
    if (!this.isEnabled) {
      return client;
    }
    
    try {
      // @ts-ignore: Type safety is hard to guarantee here, but wrapOpenAI is designed to work with SDK clients
      return wrapOpenAI(client);
    } catch (error) {
      this.logger.error(`Failed to wrap SDK client: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return client;
    }
  }
} 