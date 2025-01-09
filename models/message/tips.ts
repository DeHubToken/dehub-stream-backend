import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class Tip extends Document {
  // Unique identifier for the message within a conversation
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'DM', required: true })
  conversation: mongoose.Schema.Types.ObjectId;
  // Unique identifier for the message within a conversation
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true })
  tipBy: mongoose.Schema.Types.ObjectId;
  @Prop({ type: Number, default: false })
  chainId: number;
  @Prop({ type: Number, default: false })
  amount: number;
  @Prop({ type: String, default: false })
  tokenAddress: string;
  @Prop({ type: String, default: false })
  symbol: string;
  @Prop({ type: String, default: 'Pending' })
  status: string;
}

// Create the schema
export const TipSchema = SchemaFactory.createForClass(Tip);

// Export the model
export const DmTips: Model<Tip> = mongoose.model<Tip>('DmTips', TipSchema);
