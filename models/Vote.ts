import mongoose, { Document, Model } from 'mongoose';

// Define the Vote interface
export interface VoteDocument extends Document {
  tokenId: number;
  address: string;
  vote: boolean;
}

// Create the Vote schema
const VoteSchema = new mongoose.Schema<VoteDocument>({
  tokenId: { type: Number, required: true },
  address: { type: String, required: true },
  vote: { type: Boolean, required: true },
}, {
  timestamps: true,
});

// Create indexes
VoteSchema.index({ tokenId: 1 });
VoteSchema.index({ tokenId: 1, address: 'text' });

// Export the Vote model
export const VoteModel: Model<VoteDocument> = mongoose.model<VoteDocument>("votes", VoteSchema);
