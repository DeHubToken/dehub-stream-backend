import { IsOptional, IsString, MaxLength, MinLength, IsNotEmpty, IsMongoId } from 'class-validator';

export class GenerateImageDto {
  @IsString()
  @IsNotEmpty({ message: 'Conversation ID is required' })
  @IsMongoId({ message: 'Conversation ID must be a valid MongoDB ID' })
  conversationId: string;

  @IsString()
  @MinLength(1, { message: 'Prompt must be provided if provided' })
  @MaxLength(500, { message: 'Prompt must be less than 500 characters' })
  prompt: string;

  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Style must be less than 50 characters' })
  style?: string;
}
