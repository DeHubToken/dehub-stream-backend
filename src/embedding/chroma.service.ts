import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Document } from '@langchain/core/documents';
import { EmbeddingService } from './embedding.service';
import { ChromaClient, Collection, IncludeEnum, OpenAIEmbeddingFunction } from 'chromadb';

/**
 * Extended metadata interface for documents stored in vector database
 */
interface DocumentMetadata {
  source: string;
  page?: number;
  type: string;
  createdAt?: string;
  filename?: string;
  fileType?: string;
}

@Injectable()
export class ChromaService implements OnModuleInit {
  private readonly logger = new Logger(ChromaService.name);
  private chromaClient: ChromaClient;
  private collection: Collection;
  private readonly collectionName = 'document_embeddings';
  private initialized = false;

  constructor(
    private configService: ConfigService,
    private embeddingService: EmbeddingService,
  ) {
    const chromaUrl = this.configService.get<string>('CHROMA_URL', process.env.CHROMA_URL);
    // Initialize Chroma client (Chroma uses localhost:8000 by default)
    this.chromaClient = new ChromaClient({
      path: chromaUrl,
    });
    this.logger.log(`Initializing Chroma client with URL: ${chromaUrl}`);
  }

  async onModuleInit() {
    try {
      // Check Chroma connection and initialize collection
      await this.checkChromaConnection();
      await this.initializeCollection();
      this.initialized = true;
      this.logger.log(`Chroma collection ${this.collectionName} initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize Chroma collection: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      this.logger.warn('Make sure Chroma is running and accessible at the URL specified in CHROMA_URL environment variable');
    }
  }

  /**
   * Check connection to Chroma database
   * @throws Error if connection fails
   */
  private async checkChromaConnection(): Promise<void> {
    try {
      // Test connection by listing collections
      await this.chromaClient.listCollections();
      this.logger.log('Successfully connected to Chroma');
    } catch (error) {
      this.logger.error(`Could not connect to Chroma: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error('Could not connect to Chroma. Make sure the service is running.');
    }
  }

  /**
   * Get an existing collection or create a new one if it doesn't exist
   * @param name Collection name
   * @param metadata Optional metadata for new collection
   * @returns Collection instance
   */
  private async getOrCreateCollection(name: string, metadata?: Record<string, any>): Promise<Collection> {
    try {
      return await this.chromaClient.getCollection({ name });
    } catch (error) {
      this.logger.log(`Collection ${name} not found, creating...`);
      try {
        return await this.chromaClient.createCollection({
          name,
          metadata: metadata || { 
            description: "Document embeddings for RAG system",
            embeddingModel: "Together AI - BAAI/bge-large-en-v1.5"
          }
        });
      } catch (createError) {
        if (createError.message && createError.message.includes('already exists')) {
          this.logger.log(`Collection ${name} already exists but couldn't be retrieved initially, trying again`);
          return await this.chromaClient.getCollection({ name });
        }
        throw createError;
      }
    }
  }

  private async initializeCollection() {
    try {
      this.collection = await this.getOrCreateCollection(this.collectionName);
      this.logger.log(`Collection ${this.collectionName} initialized successfully`);
    } catch (error) {
      this.logger.error(`Error initializing Chroma collection: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Add documents to the vector database
   * @param documents Array of documents to add
   * @throws Error if service not initialized or adding fails
   */
  async addDocuments(documents: Document[]): Promise<void> {
    this.checkInitialized();

    try {
      // Get text content from documents
      const texts = documents.map(doc => doc.pageContent);
      
      // Get embeddings for text content
      const embeddings = await this.embeddingService.getEmbeddings(texts);
      
      // Create unique IDs
      const ids = documents.map(() => this.generateId());
      
      // Create metadata and normalize
      const metadatas = documents.map(doc => {
        const metadata = doc.metadata as DocumentMetadata;
        return {
          source: metadata.source || 'unknown',
          page: metadata.page || 0,
          type: metadata.type || 'document',
          createdAt: new Date().toISOString(),
          filename: metadata.filename || 'unknown',
          fileType: metadata.fileType || 'unknown',
        };
      });
      
      // Add in batch (Chroma API automatically handles batch processing)
      await this.collection.add({
        ids: ids,
        embeddings: embeddings,
        documents: texts,
        metadatas: metadatas,
      });

      this.logger.log(`Added ${documents.length} document embeddings to Chroma`);
    } catch (error) {
      this.logger.error(`Error adding documents to Chroma: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Perform similarity search against the vector database
   * @param query Query text to search for
   * @param k Number of results to return (default: 5)
   * @returns Array of Document objects with similarity results
   * @throws Error if service not initialized or search fails
   */
  async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
    this.checkInitialized();

    try {
      // Get embedding for query text
      const [queryEmbedding] = await this.embeddingService.getEmbeddings([query]);
      
      // Perform similarity search with Chroma
      // Use IncludeEnum for type safety
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: k,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
      });
      
      // Convert returned results to Document class
      const documents: Document[] = [];
      
      if (results.documents && results.documents[0]) {
        const docTexts = results.documents[0];
        const metadatas = results.metadatas?.[0] || [];
        const distances = results.distances?.[0] || [];
        
        docTexts.forEach((text, i) => {
          documents.push(
            new Document({
              pageContent: text,
              metadata: {
                ...metadatas[i] || {},
                similarity: distances[i] ? 1 - distances[i] : null,
              },
            })
          );
        });
      }
      
      return documents;
    } catch (error) {
      this.logger.error(`Error searching in Chroma: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Delete all documents from the collection
   * @throws Error if service not initialized or deletion fails
   */
  async deleteAllDocuments(): Promise<void> {
    this.checkInitialized();

    try {
      // First, try to delete all documents using collection's delete method with no filter
      // which will delete all documents but preserve the collection
      await this.collection.delete();
      
      // Force collection reinitialization to ensure a fresh, empty collection
      // This step is crucial because the delete() method might only mark for deletion
      // but not immediately clear all internal indexes
      await this.initializeCollection();
      
      // Verify the collection is empty
      const count = await this.getDocumentCount();
      if (count > 0) {
        this.logger.warn(`Collection still has ${count} documents after deletion. Trying alternative approach.`);
        
        // As a fallback strategy, delete and recreate the collection
        await this.chromaClient.deleteCollection({ name: this.collectionName });
        await this.initializeCollection();
        
        // Final verification
        const finalCount = await this.getDocumentCount();
        if (finalCount > 0) {
          throw new Error(`Failed to delete all documents. Collection still has ${finalCount} documents.`);
        }
      }
      
      this.logger.log('Deleted all documents from Chroma successfully');
    } catch (error) {
      this.logger.error(`Error deleting documents from Chroma: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
  
  /**
   * Get the number of documents in the collection
   * @returns Number of documents
   * @throws Error if service not initialized
   */
  async getDocumentCount(): Promise<number> {
    this.checkInitialized();
    
    try {
      // Query with empty embedding to get collection stats
      const result = await this.collection.count();
      return result;
    } catch (error) {
      this.logger.error(`Error getting document count from Chroma: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }

  /**
   * Check if the service is initialized
   * @throws Error if not initialized
   */
  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('Chroma service not initialized yet. Make sure Chroma is running and accessible.');
    }
  }

  /**
   * Generate a unique ID for a document
   * @returns Unique ID string
   */
  private generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substring(2, 15);
  }
} 