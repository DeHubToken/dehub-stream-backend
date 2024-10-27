import mongoose, { Schema, Document } from 'mongoose';
import { LowerCaseType } from './types/customTypes'; // Adjust the import path as necessary

interface ICollection extends Document {
  address: LowerCaseType;       // collection contract address
  lastPendingTokenId: number;   // token id to be requested to mint last time
  lastMintedTokenId: number;    // token id minted last time
  name: string;
  logo: string;
  type: string;                 // 1155 or 721
  description: string;
  defaultPrice: number;         
}

const CollectionSchema = new Schema<ICollection>(
  {
    address: { type: LowerCaseType, required: true }, // Assuming LowerCaseType is a SchemaType
    lastPendingTokenId: { type: Number, default: null }, // Optional field
    lastMintedTokenId: { type: Number, default: null },  // Optional field
    name: { type: String, required: true },
    logo: { type: String, required: true },
    type: { type: String, required: true }, // 1155 or 721
    description: { type: String, required: false }, // Optional field
    defaultPrice: { type: Number, required: true },  
  },
  {
    timestamps: true,
  }
);

// Create indexes for the collection
CollectionSchema.index({ address: 1 }, { unique: true });
CollectionSchema.index({ name: 'text', description: 'text' });

export const Collection = mongoose.model<ICollection>('collections', CollectionSchema);
