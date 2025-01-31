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

  @Prop({ required: true, unique: true })
  streamKey: string;

  @Prop({ type: String, enum: StreamStatus, default: StreamStatus.OFFLINE })
  status: StreamStatus;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  scheduledFor?: Date;

  @Prop([String])
  categories?: string[];

//   @Prop([String])
//   tags?: string[];

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

  // @Prop({ default: 0 })
  // totalTips: number;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ type: String, required: true })
  address: string;

  //   @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }] })
  //   comments: Comment[];

  //   @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reaction' }] })
  //   reactions: Reaction[];

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StreamActivity' }] })
  activities: StreamActivity[]; 

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StreamViewer' }] })
  viewers: StreamViewer[];
}

export const LiveStreamSchema = SchemaFactory.createForClass(LiveStream);
LiveStreamSchema.index({ status: 1 });
LiveStreamSchema.index({ address: 1 });
LiveStreamSchema.index({ streamKey: 1 }, { unique: true });
LiveStreamSchema.index({ createdAt: -1 });

LiveStreamSchema.statics.findWithActivities = async function(
  streamId: string,
  limit: number = 50
) {
  return this.findById(streamId)
    .populate({
      path: 'activities',
      options: {
        limit,
        sort: { createdAt: -1 }
      }
    })
    .exec();
};

export interface LiveStreamModel extends mongoose.Model<StreamDocument> {
  findWithActivities(streamId: string, limit?: number): Promise<StreamDocument>;
}