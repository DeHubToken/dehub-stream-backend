import mongoose, { Schema, Document, Model } from 'mongoose';

interface SPost extends Document {
  tokenId: Record<number, unknown>;
  userId: Record<string, unknown>;
}

const SavedPostSchema: Schema<SPost> = new Schema(
  {  
    tokenId: {type: Number, required: true},
    userId: {type: Object, required: true}
  },
  { timestamps: true }
);

const SavedPost: Model<SPost> = mongoose.model<SPost>('savedPost', SavedPostSchema);

export default SavedPost;
