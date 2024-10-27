import mongoose, { Schema, Document } from 'mongoose';

interface ILiked extends Document {
  address: string;
  tokenId: mongoose.Types.ObjectId; // Specify that tokenId is an ObjectId referencing the tokens collection
}

const LikedSchema = new Schema<ILiked>(
  {
    address: { type: String, required: true },
    tokenId: { type: Schema.Types.ObjectId, ref: 'tokens', required: true },
  },
  { timestamps: true }
);

export const LikedVideos = mongoose.model<ILiked>('upvotes', LikedSchema);
