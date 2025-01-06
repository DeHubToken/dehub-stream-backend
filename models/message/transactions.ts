import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class Message extends Document {
  // Unique identifier for the message within a conversation
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: false })
  messageId: mongoose.Schema.Types.ObjectId;

  // Optional hash of the message content for verification
  @Prop({ type: String, trim: true, required: false })
  messageHash: string;

  // Address of the sender
  @Prop({ type: String, trim: true, required: false })
  senderAddress: string;
  // Address of the sender
  @Prop({ type: String, trim: true, required: false })
  description: string;
  // Address of the receiver
  @Prop({ type: String, trim: true, required: false })
  receiverAddress: string;
  // Address of the receiver
  @Prop({ type: String, trim: true, required: false })
  status: string;

  // Address of the receiver
  @Prop({ type: String, trim: true, required: false })
  chainId: string;
  // Address of the receiver
  @Prop({ type: String, trim: true, required: false })
  type: string;
}

// Create the schema
export const MessageSchema = SchemaFactory.createForClass(Message);

// Add indexes for frequently queried fields
MessageSchema.index({ sender: 1 });
MessageSchema.index({ conversation: 1 });
MessageSchema.index({ messageId: 1 });

// Export the model
export const MessageTransactions: Model<Message> = mongoose.model<Message>('MessageTransactions', MessageSchema);
