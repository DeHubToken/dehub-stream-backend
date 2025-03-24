import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

export type IDCounterDocument = IDCounter & Document;

@Schema()
export class IDCounter extends Document{
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ default: 0 })
  seq: number;

  @Prop({ type: [Number], default: [] })
  expiredIds: number[];
}

export const IDCounterSchema = SchemaFactory.createForClass(IDCounter);
IDCounterSchema.index({ id: 1 }, { unique: true });

export const IDCounterModel: Model<IDCounterDocument> = 
  mongoose.models.id_counters || mongoose.model<IDCounterDocument>('id_counters', IDCounterSchema);
