import { IDCounterModel } from './IDCounter';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

// Interface for the Comment document
export type CommentDocument = Comment & Document;

// Define the Comment schema
@Schema({ timestamps: true })
export class Comment {
  @Prop({ unique: true })
  id: string;

  @Prop({ required: true })
  tokenId: number;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [Number], default: [] })
  replyIds: number[];

  @Prop({ default: null })
  parentId?: number; // Made optional with default null
}

// Create the schema for the Comment model
export const CommentSchema = SchemaFactory.createForClass(Comment);

// Pre-save middleware to generate a unique ID
CommentSchema.pre<CommentDocument>('save', async function (next) {
  const doc = this;

  if (!doc.id) {
    try {
      const counter = await IDCounterModel.findOneAndUpdate(
        { id: 'commentId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      doc.id = counter?.seq ?? 0; // Fallback to 0 if counter is undefined
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Index for efficient querying
CommentSchema.index({ tokenId: 1, address: 'text' });

// Export the model
export const CommentModel: Model<CommentDocument> = mongoose.model<CommentDocument>('comments', CommentSchema);
