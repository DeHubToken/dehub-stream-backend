import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import mongoose from 'mongoose';

export type TicketDocument = HydratedDocument<Ticket>;

@Schema({ timestamps: true })
export class Ticket {
  @Prop({ required: true })
  chainId: number;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  type: string;

  @Prop({
    required: true,
    enum: ['buy_token', 'refund'],
  })
  requestType: 'buy_token' | 'refund';

  @Prop({ enum: ['pending', 'processed', 'failed'], default: 'pending' })
  status: 'pending' | 'processed' | 'failed';

  @Prop()
  txnHash?: string;

  @Prop()
  description?: string;

  @Prop({ default: false })
  isResolved?: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

export const TicketModel: Model<TicketDocument> = mongoose.model<TicketDocument>('ticket', TicketSchema);
