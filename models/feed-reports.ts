import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type FeedReportsDocument = FeedReports & Document;

@Schema({ timestamps: true })
export class FeedReports {
  @Prop({ required: false })
  description: string;

  @Prop({ required: false })
  tokenId: Number;
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true })
  userId: mongoose.Schema.Types.ObjectId;
}

export const FeedReportsSchema = SchemaFactory.createForClass(FeedReports);

// Create a unique index on the tokenId field (or change to a relevant field)
FeedReportsSchema.index({ tokenId: 1 }, { unique: false });

// Export the model type and schema
export const FeedReportsModel = mongoose.model<FeedReportsDocument>('feed_reports', FeedReportsSchema);
