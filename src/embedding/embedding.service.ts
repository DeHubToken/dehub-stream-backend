import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from '@langchain/core/documents';
import { BaseDocumentLoader } from 'langchain/document_loaders/base';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import Together from 'together-ai';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly togetherClient: Together;
  private readonly embeddingModel: string = 'BAAI/bge-large-en-v1.5';

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('TOGETHER_API_KEY');
if (!apiKey) {
  this.logger.error('TOGETHER_API_KEY not found in environment variables');
  throw new InternalServerErrorException(
    'Embedding service mis-configured: TOGETHER_API_KEY missing',
  );
}
    this.togetherClient = new Together({
      apiKey,
    });
  }

  /**
   * Generates an embedding vector for a single text using Together AI API
   * 
   * @param text The text to generate an embedding for
   * @returns Promise containing the embedding vector as an array of numbers
   * @throws Error if embedding generation fails
   */
  async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.togetherClient.embeddings.create({
        input: text,
        model: this.embeddingModel,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Error getting embedding: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Generates embedding vectors for multiple texts in batch using Together AI API
   * 
   * @param texts Array of texts to generate embeddings for
   * @returns Promise containing array of embedding vectors
   * @throws Error if batch embedding generation fails
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.togetherClient.embeddings.create({
        input: texts,
        model: this.embeddingModel,
      });
      
      return response.data.map(item => item.embedding);
    } catch (error) {
      this.logger.error(`Error getting embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Loads a document from a file path based on file type
   * 
   * @param filePath Path to the document file
   * @param fileType Type of the file ('md', 'pdf', or 'txt')
   * @returns Promise containing array of Document objects
   * @throws Error if document loading fails
   */
  async loadDocument(filePath: string, fileType: 'md' | 'pdf' | 'txt'): Promise<Document[]> {
    let loader: BaseDocumentLoader;
    
    try {
      switch (fileType) {
        case 'md':
        case 'txt':
          loader = new TextLoader(filePath);
          break;
        case 'pdf':
          // PDF we need to use the pdf-parse library
          const { PDFLoader } = await import('@langchain/community/document_loaders/fs/pdf');
          loader = new PDFLoader(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      return await loader.load();
    } catch (error) {
      this.logger.error(`Error loading document: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Splits documents into smaller chunks for more effective embedding
   * 
   * @param documents Array of documents to split
   * @param chunkSize Size of chunks to split documents into (default: 1000)
   * @param chunkOverlap Overlap between chunks (default: 200)
   * @returns Promise containing array of split Document objects
   * @throws Error if document splitting fails
   */
  async splitDocuments(documents: Document[], chunkSize: number = 1000, chunkOverlap: number = 200): Promise<Document[]> {
    try {
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
      });
      
      return await textSplitter.splitDocuments(documents);
    } catch (error) {
      this.logger.error(`Error splitting documents: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Loads and splits a document in a single operation
   * 
   * @param filePath Path to the document file
   * @param fileType Type of the file ('md', 'pdf', or 'txt')
   * @param chunkSize Size of chunks to split documents into (default: 1000)
   * @param chunkOverlap Overlap between chunks (default: 200)
   * @returns Promise containing array of split Document objects
   * @throws Error if document loading or splitting fails
   */
  async loadAndSplitDocument(filePath: string, fileType: 'md' | 'pdf' | 'txt', chunkSize: number = 1000, chunkOverlap: number = 200): Promise<Document[]> {
    const documents = await this.loadDocument(filePath, fileType);
    return this.splitDocuments(documents, chunkSize, chunkOverlap);
  }

  /**
   * Loads content from a buffer based on file type
   * 
   * @param buffer Buffer containing the file content
   * @param fileType Type of the file ('md', 'pdf', or 'txt')
   * @returns Promise containing the text content
   * @throws Error if content loading fails
   */
  async loadContentFromBuffer(buffer: Buffer, fileType: 'md' | 'pdf' | 'txt'): Promise<string> {
    try {
      if (fileType === 'pdf') {
        // For PDF we need to use the pdf-parse library
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text;
      } else {
        // For text-based files, convert buffer to string
        return buffer.toString('utf-8');
      }
    } catch (error) {
      this.logger.error(`Error loading content from buffer: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
} 