import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LangSmithService } from './langsmith.service';

@Module({
  imports: [ConfigModule],
  providers: [LangSmithService],
  exports: [LangSmithService],
})
export class TracingModule {} 