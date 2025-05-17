import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

// Document type for type safety
export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true }) // Automatically manage createdAt and updatedAt fields
export class Conversation extends Document {
  @Prop({ required: true, index: true })
  userAddress: string; // Corresponds to Account.address

  @Prop()
  title: string; // Optional title for the conversation

  @Prop({ default: () => new Date() })
  lastMessageAt: Date; // For sorting conversations by recency

  @Prop({ default: false })
  isArchived: boolean; // To allow "archiving" conversations instead of deleting them
}

// Create the schema
export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Create an index for querying conversations by user, sorted by recency
ConversationSchema.index({ userAddress: 1, lastMessageAt: -1 });

// Create the model
export const ConversationModel = mongoose.model<ConversationDocument>('conversations', ConversationSchema); 