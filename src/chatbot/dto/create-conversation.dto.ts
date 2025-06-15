import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Title must be at least 1 character' })
  @MaxLength(100, { message: 'Title must be less than 100 characters' })
  title?: string; // Optional title for the new conversation
} 