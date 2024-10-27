import { IDCounterModel } from './IDCounter';

import mongoose, { Schema, Document } from 'mongoose';



interface IClaimTransaction extends Document {
  receiverAddress: string;
  tokenAddress: string;
  amount: number;
  timestamp: number;
  txHash: string;
  block: number;
  logIndex: number;
  id: number;
  chainId: number;
  status: 'pending' | 'confirmed' | 'expired';
}

const ClaimTransactionSchema = new Schema<IClaimTransaction>(
  {
    receiverAddress: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    amount: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    txHash: { type: String, required: true },
    block: { type: Number, required: true },
    logIndex: { type: Number, required: true },
    id: { type: Number, unique: true },
    chainId: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'expired'], default: 'pending' },
  },
  { timestamps: true }
);

ClaimTransactionSchema.pre<IClaimTransaction>('save', async function (next) {
  const doc = this;

  if (!doc.id) {
    try {
      const counter = await IDCounterModel.findOneAndUpdate(
        { id: 'claimId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      if (counter) {
        doc.id = counter.seq; // Set the incremented value
      }
      next(); // Call next() to proceed
    } catch (error) {
      next(error); // Pass error to next middleware
    }
  } else {
    next(); // Proceed if id is already set
  }
});

export const ClaimTransaction = mongoose.model<IClaimTransaction>('claim_transactions', ClaimTransactionSchema);
