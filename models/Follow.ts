import mongoose, { Schema, Document } from 'mongoose';

export interface IFollow extends Document {
  address: string;
  following: string; // following address
}

const FollowSchema = new Schema<IFollow>(
  {
    address: { type: String, required: true },
    following: { type: String, required: true }, // following address
  },
  {
    timestamps: true,
  }
);

// Create text indexes for address and following
FollowSchema.index({ address: 'text' });
FollowSchema.index({ following: 'text' });

export const Follow = mongoose.model<IFollow>('followers', FollowSchema);
