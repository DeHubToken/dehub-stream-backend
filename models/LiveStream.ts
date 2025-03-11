import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { Account } from './Account';
import { StreamStatus } from 'config/constants';
import { StreamViewer } from './LiveStreamViewer';
import { StreamActivity } from './LiveStreamActivity';

export type StreamDocument = LiveStream & Document;

@Schema({ timestamps: true })
export class LiveStream {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  thumbnail?: string;

  @Prop()
  streamUrl?: string;

  @Prop({ unique: true })
  streamKey: string;

  @Prop({ unique: true })
  livepeerId: string;

  @Prop()
  playbackId: string;

  @Prop({ type: String, enum: StreamStatus, default: StreamStatus.OFFLINE })
  status: StreamStatus;

  @Prop({ type: Boolean })
  isActive: boolean;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  scheduledFor?: Date;

  @Prop([String])
  categories?: string[];

  @Prop({ type: mongoose.Schema.Types.Mixed })
  settings?: Record<string, any>;

  @Prop({ default: 0 })
  peakViewers: number;

  @Prop({ default: 0 })
  totalViews: number;

  @Prop({ default: 0 })
  likes: number;

  @Prop({ default: 0 })
  likesCount: number;

  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  likesRecord: Record<string, boolean>;

  @Prop({ default: 0 })
  totalTips: number;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ type: String, required: true })
  address: string;

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StreamActivity' }] })
  activities: StreamActivity[];

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StreamViewer' }] })
  viewers: StreamViewer[];

  @Prop({ type: mongoose.Schema.Types.Mixed })
  meta?: Record<string, any>; // Extras

  @Prop({ default: 0 })
  streamDelay: number;

  // merging with Tokens
  @Prop()
  tokenId?: number;

  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  streamInfo: any;
}

export const LiveStreamSchema = SchemaFactory.createForClass(LiveStream);
LiveStreamSchema.index({ status: 1 });
LiveStreamSchema.index({ address: 1 });
LiveStreamSchema.index({ streamKey: 1 }, { unique: true });
LiveStreamSchema.index({ createdAt: -1 });

LiveStreamSchema.statics.findWithActivities = async function (streamId: string, limit: number = 50) {
  return this.findById(streamId)
    .populate({
      path: 'activities',
      options: {
        limit,
        sort: { createdAt: -1 },
      },
    })
    .exec();
};

export interface LiveStreamModel extends mongoose.Model<StreamDocument> {
  findWithActivities(streamId: string, limit?: number): Promise<StreamDocument>;
}
