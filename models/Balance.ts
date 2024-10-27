import mongoose, { Schema, Document } from 'mongoose';

interface IBalance extends Document {
  address: string;
  chainId: number;
  tokenAddress: string;
  deposited: number;
  claimed: number;
  pending: number;
  reward: number;
  staked: number;
  balance: number;
  lockForPPV: number;
  lockForBounty: number;
  paidForPPV: number;
  paidTips: number;
  sentTips: number;
  walletBalance: number;
  updateWalletBalanceAt: Date;
}

const BalanceSchema = new Schema<IBalance>(
  {
    address: { type: String, required: true },
    chainId: { type: Number, required: true },
    tokenAddress: { type: String, required: true },
    deposited: { type: Number, default: 0 },
    claimed: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    reward: { type: Number, default: 0 },
    staked: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    lockForPPV: { type: Number, default: 0 },
    lockForBounty: { type: Number, default: 0 },
    paidForPPV: { type: Number, default: 0 },
    paidTips: { type: Number, default: 0 },
    sentTips: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    updateWalletBalanceAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

BalanceSchema.index({ address: 1 });
BalanceSchema.index({ address: 1, chainId: 1, tokenAddress: 1 });

export const Balance = mongoose.model<IBalance>('balances', BalanceSchema);
