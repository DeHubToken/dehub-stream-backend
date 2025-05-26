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
  @Prop({ enum: ['init', 'pending', 'succeeded', 'complete', 'failed', 'expired'], default: 'init' })
  status_stripe: 'init' | 'pending' | 'succeeded' | 'complete' | 'failed' | 'expired'; // Payment status
  @Prop({ type: [Object], default: [] })
  stripe_hooks?: Record<string, any>[];  
  @Prop()
  latest_charge?: string;
  @Prop()
  balanceTransactionId?: string;
  @Prop()
  txnHash?: string;
  @Prop()
  isChargeSucceeded: boolean;
  @Prop()
  isChargeRefunded: boolean;
  @Prop()
  idPaymentMethodAttached: boolean;
  @Prop()
  isChargeFailed: boolean;
  @Prop()
  exchange_rate?: number;
  @Prop()
  net?: number;
  @Prop()
  fee?: number;
  @Prop()
  note?: string;
  @Prop({ enum: ['buy_token', 'tip', 'paid-dm', 'subscription'], required: true, default: 'buy_token' })
  type: 'buy_token' | 'tip' | 'paid-dm' | 'subscription';
  // 🕑 For CRON: track token send status
  @Prop({ enum: ['not_sent', 'sent', 'processing', 'cancelled', 'failed'], default: 'not_sent' })
  tokenSendStatus: 'not_sent' | 'cancelled' | 'processing' | 'sent' | 'failed';
  @Prop({ enum: ['not_sent', 'sent', 'processing', 'cancelled', 'failed'], default: 'not_sent' })
  ethSendStatus: 'not_sent' | 'cancelled' | 'processing' | 'sent' | 'failed';
  // 🔁 Retry count to limit retries
  @Prop({ default: 0 })
  tokenSendRetryCount: number;
  @Prop()
  receiverAddress: string;
  // ✅ On successful send, store thiss
  @Prop()
  tokenSendTxnHash?: string;
  @Prop()
  ethSendTxnHash?: string;
  @Prop()
  currency: string;
  @Prop()
  intentId?: string;
  @Prop({ default: false })
  isIntentCreated?: Boolean;  
  @Prop()
  approxTokensToReceive?: string;
  @Prop()
  tokenReceived?: string;
  @Prop()
  ethToSent?: string;
  // ⏰ When was last CRON attempt
  @Prop()
  lastTriedAt?: Date;
  @Prop({ enum: ['dehub', 'unknown'], default: 'dehub' })
  platform: 'unknown' | 'dehub';
  @Prop()
  createdAt?: Date;
  @Prop()
  updatedAt?: Date;
  @Prop()
  expires_at: Number;
}

export const DpayTnxSchema = SchemaFactory.createForClass(DpayTnx);

export const DpayTnxModel: Model<DpayTnxDocument> = mongoose.model<DpayTnxDocument>('dpay-tnx', DpayTnxSchema);
