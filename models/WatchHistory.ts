import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

export type WatchHistoryDocument = WatchHistory & Document;

@Schema({ timestamps: true })
export class WatchHistory {
  @Prop({ type: Number, index: true })
  tokenId: number;

  @Prop({ type: String, index: true })
  watcherAddress: string;

  @Prop({ type: Date, index: true })
  startedAt: Date;

  @Prop({ type: Date })
  exitedAt?: Date;

  @Prop({ type: String, default: 'created' }) // created, confirmed, pendingForPPV, lockForPPV, failedForPPV
  status: string;

  @Prop({ type: Number })
  chainId: number;

  @Prop({ type: Number })
  lastWatchedFrame?: number;

  @Prop({ type: Number }) // in second unit
  watchedTime?: number;

  @Prop({ type: Number })
  fundedTokenValue?: number;
}

export const WatchHistorySchema = SchemaFactory.createForClass(WatchHistory);

export const WatchHistoryModel: Model<WatchHistoryDocument> = mongoose.model<WatchHistoryDocument>('watchhistories', WatchHistorySchema);
