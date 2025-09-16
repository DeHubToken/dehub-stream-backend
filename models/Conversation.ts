import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

/**
 * Represents a Conversation document with Mongoose Document capabilities
 * Combines the Conversation class properties with Mongoose Document methods
 */
 export type ConversationDocument = Conversation & Document;
@Schema({ timestamps: true }) // Automatically manage createdAt and updatedAt fields
 export class Conversation {
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
