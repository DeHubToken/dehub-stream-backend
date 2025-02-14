import mongoose, { Document, Model } from 'mongoose';
import { IDCounterModel } from './IDCounter'; // Adjust the path as needed
import { NFT_NAME_PREFIX } from 'config/constants'; // Adjust the path as needed
import { AccountModel } from './Account';
import { ActivityActionType, ActivityModel } from './activity';
import { config } from 'config';

export const postType = {
  video: 'video',
  feedImages: 'feed-images',
  feedSimple: 'feed-simple',
};

export const PostActivityType = {
  [postType.feedImages]: ActivityActionType.UPLOAD_FEED_IMAGES,
  [postType.video]: ActivityActionType.UPLOAD_VIDEO,
  [postType.feedSimple]: ActivityActionType.UPLOAD_FEED_SIMPLE,
};

// Define the interface for the Token document
export interface TokenDocument extends Document {
  symbol: string;
  address: string;
  name: string;
  decimals?: number;
  chainId?: number;
  logoURI?: string;
  totalSupply?: number;
  tokenId?: number;
  price?: number;
  metaDataUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  site?: string;
  progress?: number;
  contractAddress?: string;
  minter?: string;
  owner?: string;
  streamInfo?: object; // Define a specific type if needed
  videoExt?: string;
  imageExt?: string;
  description?: string;
  videoInfo?: object; // Define a specific type if needed
  videoDuration?: number;
  videoFilePath?: string;
  likes?: number;
  isHidden?: boolean;
  views?: number;
  comments?: number;
  totalVotes?: object; // e.g., { for: 15, against: 1 }
  lockedBounty?: object;
  totalTips?: number;
  totalFunds?: number;
  status?: 'signed' | 'pending' | 'minted' | 'deleted' | 'failed' | 'burned' | 'checking';
  transcodingStatus?: string;
  category?: string[];
  mintTxHash?: string;
  postType?: 'video' | 'feed-images' | 'feed-simple';
  imageUrls: string[];
  plans: string[];
}

// Define the Token schema
const TokenSchema = new mongoose.Schema<TokenDocument>(
  {
    symbol: { type: String },
    name: { type: String },
    decimals: { type: Number },
    chainId: { type: Number },
    logoURI: { type: String },
    totalSupply: { type: Number }, // total supply
    tokenId: { type: Number, unique: true },
    price: { type: Number },
    metaDataUrl: { type: String },
    imageUrl: { type: String }, // related path
    videoUrl: { type: String }, // related path
    site: { type: String },
    contractAddress: { type: String },
    minter: { type: String },
    owner: { type: String },
    isHidden: { type: Boolean },
    progress: { type: Number },
    streamInfo: { type: Object }, // or use a specific type
    videoExt: { type: String },
    imageExt: { type: String },
    description: { type: String },
    videoInfo: { type: Object }, // or use a specific type
    videoDuration: { type: Number }, // in seconds
    videoFilePath: { type: String },
    likes: { type: Number },
    views: { type: Number },
    comments: { type: Number },
    totalVotes: { type: Object }, // e.g., { for: 15, against: 1 }
    lockedBounty: { type: Object },
    totalTips: { type: Number }, // total tips received from any users
    totalFunds: { type: Number }, // total funds received from pay-per-view
    status: {
      type: String,
      default: 'signed',
      enum: ['signed', 'pending', 'minted', 'deleted', 'failed', 'burned', 'checking'],
    },
    transcodingStatus: { type: String },
    category: { type: [String] },
    mintTxHash: { type: String },
    imageUrls: { type: [String], default: [] },
    postType: {
      type: String,
      default: 'video',
      enum: ['video', 'feed-images', 'feed-simple'],
    },
    plans: {
      type: [String], //hare is this Plans table plans.id  as array
      default: [],
    },
  },
  { timestamps: true },
);

// Pre-save hook to generate tokenId and other properties
TokenSchema.pre<TokenDocument>('save', async function (next) {
  const doc = this;

  if (!doc.tokenId) {
    try {
      const counter = await IDCounterModel.findOneAndUpdate(
        { id: 'tokenId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );

      doc.tokenId = counter.seq;
      if (doc.postType != 'video') {
        return next();
      }
      if (!doc.name) {
        // Generate default name and URLs if not provided
        doc.name = `${NFT_NAME_PREFIX} #${doc.tokenId}`;
      }
      if (!doc.imageUrl) {
        doc.imageUrl = `images/${doc.tokenId}.${doc.imageExt || 'png'}`;
      }
      if (!doc.videoUrl) {
        doc.videoUrl = `videos/${doc.tokenId}`;
      }
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Create indexes
TokenSchema.index({ minter: 1 });
TokenSchema.index({ category: 1 });

// Create and export the Token model
export const TokenModel: Model<TokenDocument> = mongoose.model<TokenDocument>('tokens', TokenSchema);

// if (config.isDevMode) {
//   console.log('Running Dev Mode: NFT Mint Auto Enabled only in Dev Mode');

//   setInterval(async () => {
//     console.log('Auto Minting...');

//     const res = await TokenModel.findOneAndUpdate(
//       { status: { $ne: 'minted' } }, // Only update if not already minted
//       { $set: { status: 'minted' } },
//     );

//     console.log(`Minting completed. Affected count: `,res?1:0);
//   }, 1000 * 10);
// }
