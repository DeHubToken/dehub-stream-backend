import { IsString, IsNotEmpty, IsOptional, MaxLength, MinLength, IsMongoId } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message must be provided if provided' })
  @MaxLength(2000, { message: 'Message must be less than 2000 characters' })
  text: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @IsMongoId({ message: 'Conversation ID must be a valid MongoDB ID' })
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'tempId must be less than 50 characters' })
  tempId?: string;
} 