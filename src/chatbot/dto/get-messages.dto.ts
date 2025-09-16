import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';

export class GetMessagesDto {
  @IsString()
  @IsNotEmpty({ message: 'Conversation ID is required' })
  @IsMongoId({ message: 'Conversation ID must be a valid MongoDB ID' })
  conversationId: string;
} 