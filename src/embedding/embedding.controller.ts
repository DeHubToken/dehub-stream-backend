import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { ChromaService } from './chroma.service';
import { EmbeddingService } from './embedding.service';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

// Map of supported file extensions with their base types
const SUPPORTED_FILE_TYPES = {
  // Markdown variants
  'md': 'md',
  'mdx': 'md',
  'markdown': 'md',
  // Plain text variants
  'txt': 'txt',
  'text': 'txt',
  // PDF
  'pdf': 'pdf',
};

@Controller('embedding')
export class EmbeddingController {
  private readonly logger = new Logger(EmbeddingController.name);

  constructor(
    private chromaService: ChromaService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Upload and process a document for embedding
   * 
   * @param file File to upload and process
   * @param chunkSize Size of chunks to split document into (optional)
   * @param chunkOverlap Overlap between chunks (optional)
   * @returns Processing result
   */
  /* TODO: Add admin guard */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Please provide a file.');
    }

    // Get file extension
    const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
    
    // Validate file type
    if (!Object.keys(SUPPORTED_FILE_TYPES).includes(fileExtension)) {
      throw new BadRequestException(
        `Unsupported file type: ${fileExtension}. Supported file types: ${Object.keys(SUPPORTED_FILE_TYPES).join(', ')}`
      );
    }
    
    // Get the base file type for processing
    const baseFileType = SUPPORTED_FILE_TYPES[fileExtension];

    let tempFilePath = null;
    let tempDir = null;
    
    try {
      // Create a temporary file
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'embedding-'));
      // Unique dosya adı oluşturmak için crypto modülünü kullanıyoruz
      tempFilePath = path.join(tempDir, `${crypto.randomUUID()}.${fileExtension}`);
      
      // Write the file
      await fs.writeFile(tempFilePath, file.buffer);
      
      // Process and embed the document
      const documents = await this.embeddingService.loadAndSplitDocument(
        tempFilePath,
        baseFileType as 'md' | 'pdf' | 'txt',
        1000,
        200,
      );
      
      if (documents.length === 0) {
        throw new BadRequestException('Document processing resulted in no content to embed.');
      }
      
      // Add to vector store (Chroma'ya ekle)
      await this.chromaService.addDocuments(documents);
      
      return {
        success: true,
        message: `File processed and embedded successfully`,
        details: {
          filename: file.originalname,
          chunks: documents.length,
          chunkSize: 1000,
          chunkOverlap: 200,
        },
      };
    } catch (error) {
      this.logger.error(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      if (error.message && error.message.includes('Chroma')) {
        throw new InternalServerErrorException(
          `Vector database error: ${error.message}. Please check if Chroma service is running.`
        );
      }
      
      throw new InternalServerErrorException(
        `Document processing failed: ${error.message || 'Unknown error'}`
      );
    } finally {
      // Clean up temp file and directory
      try {
        if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      } catch (cleanupError) {
        this.logger.warn(`Failed to clean up temporary files: ${cleanupError.message}`);
      }
    }
  }

  /**
   * Delete all documents from the vector store
   * 
   * @returns Deletion result
   */
  @Post('delete-all')
  async deleteAllDocuments() {
    try {
      // Get document count before deletion
      const countBeforeDeletion = await this.chromaService.getDocumentCount();
      this.logger.debug(`Document count before deletion: ${countBeforeDeletion}`);
      
      // Delete all documents
      await this.chromaService.deleteAllDocuments();
      
      // Verify deletion by checking document count
      const countAfterDeletion = await this.chromaService.getDocumentCount();
      this.logger.debug(`Document count after deletion: ${countAfterDeletion}`);
      
      if (countAfterDeletion > 0) {
        throw new Error(`Failed to delete all documents. ${countAfterDeletion} documents still remain.`);
      }
      
      return {
        success: true,
        message: 'All documents deleted successfully',
        details: {
          documentsBeforeDeletion: countBeforeDeletion,
          documentsAfterDeletion: countAfterDeletion
        }
      };
    } catch (error) {
      this.logger.error(`Error deleting documents: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        error instanceof Error ? error.stack : undefined);
      
      if (error.message && error.message.includes('not initialized')) {
        throw new InternalServerErrorException(
          'Vector database is not initialized. Please check if Chroma service is running.'
        );
      }
      
      throw new InternalServerErrorException(
        `Failed to delete documents: ${error.message || 'Unknown error'}`
      );
    }
  }
} 