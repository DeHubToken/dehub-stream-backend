import mongoose, { Document, Model } from 'mongoose';

// Define the interface for the PPVTransaction document
export interface PPVTransactionDocument extends Document {
  address: string;  // "payer address"
  amount: number;   // "paid amount"
  streamTokenId: number; // token id for stream NFT
  chainId: number;  // chain id
  tokenAddress: string; // token address paid
}

// Define the PPVTransaction schema
const PPVTransactionSchema = new mongoose.Schema<PPVTransactionDocument>(
  {
    address: { type: String, required: true }, // "payer address"
    amount: { type: Number, required: true }, // "paid amount"
    streamTokenId: { type: Number, required: true }, // token id for stream NFT
    chainId: { type: Number, required: true }, // chain id
    tokenAddress: { type: String, required: true }, // token address paid
  },
  { timestamps: true }
);

// Create indexes
PPVTransactionSchema.index({ address: 1, streamTokenId: 1, createdAt: 1 });

// Create and export the PPVTransaction model
export const PPVTransactionModel: Model<PPVTransactionDocument> = mongoose.model<PPVTransactionDocument>('ppv_transactions', PPVTransactionSchema);
