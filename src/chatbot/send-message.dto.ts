import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  conversationId?: string; // Optional: If null, a new conversation will be created

  @IsString()
  @IsOptional()
  tempId?: string; // Optional: Client-generated ID for tracking this message before server response
} 