import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { ConversationDocument } from './Conversation';

// Document type for type safety
export type ChatMessageDocument = ChatMessage & Document;

// Enum for message sender types
export enum MessageSenderType {
  USER = 'user',
  AI = 'ai',
  SYSTEM = 'system', // For system messages like "Conversation started"
}

@Schema({ timestamps: true }) // Automatically manage createdAt and updatedAt fields
export class ChatMessage extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: ConversationDocument | mongoose.Schema.Types.ObjectId;

  @Prop({ required: true, index: true })
  senderAddress: string; // The address of the sender (user or system/AI identified by user context)

  @Prop({ type: String, enum: Object.values(MessageSenderType), required: true })
  senderType: MessageSenderType;

  @Prop({ required: true })
  text: string; // Text content of the message

  @Prop()
  imageUrl: string; // For image messages (from user upload or AI generation)
}

// Create the schema
export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Create an index for efficiently retrieving messages in a conversation chronologically
ChatMessageSchema.index({ conversationId: 1, createdAt: 1 });

// Create the model
export const ChatMessageModel = mongoose.model<ChatMessageDocument>('chat_messages', ChatMessageSchema); 