import mongoose, { Schema, Document } from 'mongoose';

interface IFeature extends Document {
  tokenId: number;
  address: string;
}

const FeatureSchema = new Schema<IFeature>(
  {
    tokenId: { type: Number, required: true },
    address: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

// Create an index for tokenId and a text index for address
FeatureSchema.index({ tokenId: 1, address: 'text' });

export const Feature = mongoose.model<IFeature>('features', FeatureSchema);
