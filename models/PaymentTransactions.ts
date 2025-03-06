import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export enum TransactionType {
  BUY = 'buy',
  SELL = 'sell',
  PRINCIPAL = 'principal',
}

// Define the PaymentTransaction schema with timestamps
@Schema({ timestamps: true })
export class PaymentTransaction {

  @Prop({ required: true })
  address: string; 

  @Prop({ required: false })
  transactionId: string;

  @Prop({ required: true })
  status: string;

  @Prop({ type: Object, required: false })
  data: any;

  @Prop({ type: Types.ObjectId, ref: 'accounts', required: false })
  account: Types.ObjectId;

  @Prop({ required: true, enum: TransactionType })
  transactionType: TransactionType
}

// Extend the PaymentTransaction with the timestamp fields
export type TransactionDocument = PaymentTransaction & Document & {
  createdAt: Date;
  updatedAt: Date;
};

export const TransactionSchema = SchemaFactory.createForClass(PaymentTransaction);

// Optionally, if you need a specific model type
export const TransactionModel = mongoose.model<TransactionDocument>('paymentTransaction', TransactionSchema);
