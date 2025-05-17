import { IsString, IsOptional } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsOptional()
  title?: string; // Optional title for the new conversation
} 