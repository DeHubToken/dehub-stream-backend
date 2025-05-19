import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { ChromaService } from './chroma.service';
import { EmbeddingController } from './embedding.controller';
import { TracingModule } from '../tracing/tracing.module';

@Module({
  imports: [ConfigModule, TracingModule],
  controllers: [EmbeddingController],
  providers: [EmbeddingService, ChromaService],
  exports: [EmbeddingService, ChromaService],
})
export class EmbeddingModule {} 