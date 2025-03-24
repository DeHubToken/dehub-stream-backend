import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export const ActivityActionType = {
  UPLOAD_FEED_SIMPLE: 'upload-feed-simple',
  UPLOAD_FEED_IMAGES: 'upload-feed-images',
  UPLOAD_VIDEO: 'upload_video',
  CREATE_LIVE: 'CREATE_LIVE',
  CREATE_PLAN: 'create-plan',
  PLAN_PUBLISHED: 'plan-published',
  PURCHASE_PLAN: 'purchase-plan',
  LIKE: 'like',
  DIS_LIKE: 'dis-like',
  FOLLOW: 'follow',
  REPLY_ON_POST: 'reply-on-post',
  COMMENT_ON_POST: 'comment-on-post',
  TIP_ON_POST: 'tip-on-post',
  TIP_ON_CHAT: 'tip-on-chat',
};

export type ActivityDocument = Activity & Document;

@Schema({ timestamps: true })
export class Activity extends Document {
  @Prop({ required: false })
  tokenId?: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: false })
  userId?: mongoose.Schema.Types.ObjectId;
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: false })
  following?: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Plans', required: false })
  planId?: mongoose.Schema.Types.ObjectId;
  @Prop({
    type: String,
    enum: Object.values(ActivityActionType),
    required: true,
  })
  type: string;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// Index for better query performance
ActivitySchema.index({ tokenId: 1 });
ActivitySchema.index({ userId: 1, type: 1 });

export const ActivityModel = mongoose.model<ActivityDocument>('Activity', ActivitySchema);
