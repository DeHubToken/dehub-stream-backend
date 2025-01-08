import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class MessageTransaction extends Document {
  // Unique identifier for the message within a conversation
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true })
  messageId: mongoose.Schema.Types.ObjectId;
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'DM', required: true })
  conversation: mongoose.Schema.Types.ObjectId; 
  // Optional hash of the message content for verification
  @Prop({ type: String, trim: true, required: false })
  transactionHash: string; 
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
  amount: string;
  // Address of the receiver
  @Prop({ type: String, trim: true, required: false })
  type: string;
}

// Create the schema
export const MessageTransactionSchema = SchemaFactory.createForClass(MessageTransaction);
 

// Export the model
export const MessageTransactions: Model<MessageTransaction> = mongoose.model<MessageTransaction>(
  'MessageTransactions',
  MessageTransactionSchema,
);
