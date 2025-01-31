import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { LiveStream } from './LiveStream';
import { StreamActivityType } from 'config/constants';

export type StreamActivityDocument = StreamActivity & Document;

@Schema({ timestamps: true })
export class StreamActivity {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true })
  streamId: LiveStream | string;

  @Prop({ type: String, enum: StreamActivityType, required: true })
  status: StreamActivityType;

  @Prop({ type: String })
  address?: string;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  meta?: Record<string, any>; // address, comment, reaction type, like and any other required details 
}

export const StreamActivitySchema = SchemaFactory.createForClass(StreamActivity);
// StreamActivitySchema.index({ streamId: 1, address: 1 }, { unique: true });
StreamActivitySchema.index({ streamId: 1, createdAt: -1 });
StreamActivitySchema.index({ address: 1, createdAt: -1 });
