import mongoose, { Schema, Document, Model } from 'mongoose';


enum RewardType {
    PayPerView = 'PayPerView',
    FirstComment = 'FirstComment',
    FirstView = 'FirstView',
    Tip = 'Tip',
    BountyForViewer = 'BountyForViewer',
    BountyForCommentor = 'BountyForCommentor',
  }

interface IReward extends Document {
  address: string;
  rewardAmount: number;
  tokenId: number;
  from: string;
  chainId: number;
  type: RewardType;
}

const RewardSchema: Schema<IReward> = new Schema(
  {
    address: { type: String, required: true },
    rewardAmount: { type: Number, required: true },
    tokenId: { type: Number, required: true },
    from: { type: String, required: true },
    chainId: { type: Number, required: true },
    type: {
      type: String,
      enum: Object.values(RewardType),
      default: RewardType.PayPerView,
      index: true,
    },
  },
  { timestamps: true }
);

const Reward: Model<IReward> = mongoose.model<IReward>('rewards', RewardSchema);

export default Reward;
