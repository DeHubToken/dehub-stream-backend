import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { LiveStream } from './LiveStream';
import { Account } from './Account';

export type StreamViewerDocument = StreamViewer & Document;

@Schema()
export class StreamViewer {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true })
  streamId: LiveStream | string;

  @Prop({ type: String, ref: 'Account', required: true })
  address: string;

  @Prop({ required: true, default: Date.now })
  joinedAt: Date;

  @Prop()
  leftAt?: Date;

  @Prop({ default: 0 })
  duration: number;
}

export const StreamViewerSchema = SchemaFactory.createForClass(StreamViewer);
// StreamViewerSchema.index({ streamId: 1, address: 1 }, { unique: true });
