import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class TipAndDmTnx extends Document {
  // Unique identifier for the message within a conversation
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Message' })
  messageId: mongoose.Schema.Types.ObjectId;
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'DmTips' })
  tipId: mongoose.Schema.Types.ObjectId;
  // Optional hash of the message content for verification
  @Prop({ type: String, trim: true, required: false })
  transactionHash: string;
  // Address of the sender
  @Prop({ type: String, trim: true, required: false })
  senderAddress: string;
  // Address of the sender
  @Prop({ type: String, trim: true, required: false })
  tokenAddress: string;
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
  @Prop({ type: Number, required: false })
  chainId: string;
  // Address of the receiver
  @Prop({ type: String, trim: true, required: false })
  amount: number;
  // Address of the receiver
  @Prop({ type: String, trim: true, required: false })
  type: string;
}

// Create the schema
export const TipAndDmTnxSchema = SchemaFactory.createForClass(TipAndDmTnx);

// Export the model
export const TipAndDmTnxModal: Model<TipAndDmTnx> = mongoose.model<TipAndDmTnx>('tip-and-dm-tnx', TipAndDmTnxSchema);
