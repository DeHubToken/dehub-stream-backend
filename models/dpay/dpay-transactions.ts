import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import mongoose from 'mongoose';

export type DpayTnxDocument = HydratedDocument<DpayTnx>;

@Schema({ timestamps: true })
export class DpayTnx {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Account' })
  receiverId?: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  tokenSymbol: string;

  @Prop()
  tokenAddress?: string;

  @Prop({ required: true })
  chainId: number;

  @Prop({ enum: ['init', 'pending', 'succeeded', 'failed'], default: 'init' })
  status_stripe: 'init' | 'pending' | 'succeeded' | 'failed'; // Payment status

  @Prop()
  txnHash?: string;

  @Prop()
  note?: string;

  @Prop({ enum: ['buy_token', 'tip', 'paid-dm', 'subscription'], required: true, default: 'buy_token' })
  type: 'buy_token' | 'tip' | 'paid-dm' | 'subscription';

  // 🕑 For CRON: track token send status
  @Prop({ enum: ['not_sent', 'sent', 'processing', 'cancelled', 'failed'], default: 'not_sent' })
  tokenSendStatus: 'not_sent' | 'cancelled' | 'processing' | 'sent' | 'failed';

  // 🔁 Retry count to limit retries
  @Prop({ default: 0 })
  tokenSendRetryCount: number;
  @Prop()
  receiverAddress: string;
  // ✅ On successful send, store thiss
  @Prop()
  tokenSendTxnHash?: string;
  @Prop()
  intentId?: string;
  @Prop({ default: false })
  isIntentCreated?: Boolean;
  @Prop()
  approxTokensToReceive?: string;
  @Prop()
  approxTokensToSent?: string;
  // ⏰ When was last CRON attempt
  @Prop()
  lastTriedAt?: Date;
  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DpayTnxSchema = SchemaFactory.createForClass(DpayTnx);

export const DpayTnxModel: Model<DpayTnxDocument> = mongoose.model<DpayTnxDocument>('dpay-tnx', DpayTnxSchema);
