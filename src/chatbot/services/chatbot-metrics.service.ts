import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ChatbotMetricsService {
  private readonly logger = new Logger(ChatbotMetricsService.name);
  
  private activeConnections = 0;
  private messagesProcessedSinceLastLog = 0;
  private imagesGeneratedSinceLastLog = 0;
  private imagesAnalyzedSinceLastLog = 0;
  private errorsSinceLastLog = 0;
  private customRateLimitBlocks = 0;

  // Connection Metrics
  incrementActiveConnections(): void {
    this.activeConnections++;
  }
  decrementActiveConnections(): void {
    if (this.activeConnections > 0) {
      this.activeConnections--;
    }
  }
  getActiveConnections(): number {
    return this.activeConnections;
  }

  // Processed Item Metrics
  incrementMessagesProcessed(): void {
    this.messagesProcessedSinceLastLog++;
  }
  incrementImagesGenerated(): void {
    this.imagesGeneratedSinceLastLog++;
  }
  incrementImagesAnalyzed(): void {
    this.imagesAnalyzedSinceLastLog++;
  }

  // Error Metrics
  incrementErrors(): void {
    this.errorsSinceLastLog++;
  }

  // Rate Limit Metrics
  incrementCustomRateLimitBlocks(): void {
    this.customRateLimitBlocks++;
  }

  @Cron(CronExpression.EVERY_5_MINUTES) // Log every 5 minutes
  logMetrics(): void {
    this.logger.log(
      `[MetricsSnapshot] Active Connections: ${this.activeConnections}, ` +
      `Messages Processed (1min): ${this.messagesProcessedSinceLastLog}, ` +
      `Images Generated (1min): ${this.imagesGeneratedSinceLastLog}, ` +
      `Images Analyzed (1min): ${this.imagesAnalyzedSinceLastLog}, ` +
      `Errors (1min): ${this.errorsSinceLastLog}, ` +
      `RateLimit Blocks (1min): ${this.customRateLimitBlocks}`
    );
    // Reset periodic counters
    this.messagesProcessedSinceLastLog = 0;
    this.imagesGeneratedSinceLastLog = 0;
    this.imagesAnalyzedSinceLastLog = 0;
    this.errorsSinceLastLog = 0;
    this.customRateLimitBlocks = 0;
  }
} 