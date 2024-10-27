import mongoose, { Schema, Document, Model } from 'mongoose';

interface ITransaction extends Document {
  from: string;
  to: string;
  tokenAddress: string;
  tokenId: string;
  txHash: string;
  timestamp: number;
  blockNumber: number;
  amount: number;
  type: 'DEPOSIT' | 'CLAIM' | 'STAKE' | 'UNSTAKE' | 'BOUNTY_VIEWER' | 'BOUNTY_COMMENTOR';
  logIndex: number;
  status: string;
  chainId: number;
}

const TransactionSchema: Schema<ITransaction> = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    tokenId: { type: String, required: true },
    txHash: { type: String, required: true },
    timestamp: { type: Number, required: true },
    blockNumber: { type: Number, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['DEPOSIT', 'CLAIM', 'STAKE', 'UNSTAKE'], default: 'DEPOSIT' },
    logIndex: { type: Number, required: true },
    status: { type: String, required: true },
    chainId: { type: Number, required: true },
  },
  { timestamps: true }
);

TransactionSchema.index({ blockNumber: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ createdAt: 1 });
TransactionSchema.index({ txHash: 1, logIndex: 1});

const TransactionModel: Model<ITransaction> = mongoose.model<ITransaction>('transactions', TransactionSchema);

export default TransactionModel;
