import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';
import { ConversationDocument } from './Conversation';

// Document type for type safety
export type ChatMessageDocument = ChatMessage & Document;

// Enum for message sender types
export enum MessageSenderType {
  USER = 'user',
  AI = 'ai',
  SYSTEM = 'system', // For system messages like "Conversation started"
}

@Schema({ 
  timestamps: true, 
  collection: 'chat_messages' // Explicitly set collection name with underscore
}) 
export class ChatMessage {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId | ConversationDocument;

  @Prop({ required: true, index: true })
  senderAddress: string; // The address of the sender (user or system/AI identified by user context)

  @Prop({ type: String, enum: Object.values(MessageSenderType), required: true })
  senderType: MessageSenderType;

  @Prop({ required: true })
  text: string; // Text content of the message

  @Prop()
  imageUrl?: string; // For image messages (from user upload or AI generation)
  
  @Prop({ type: mongoose.Schema.Types.Mixed })
  metadata?: Record<string, any>; // Additional metadata for special message types like image analysis
  
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage' })
  replyToMessage?: Types.ObjectId | ChatMessageDocument; // For replies to specific messages
}

// Create the schema
export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Create an index for efficiently retrieving messages in a conversation chronologically
ChatMessageSchema.index({ conversationId: 1, createdAt: 1 });

