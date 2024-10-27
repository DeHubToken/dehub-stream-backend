import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

// Define the interface for the Account document
export type AccountDocument = Account & Document;

@Schema({ timestamps: true }) // Automatically manage createdAt and updatedAt fields
export class Account {
  @Prop({ unique: true, required: true })
  address: string; // Account address

  @Prop()
  lastLoginTimestamp: number;

  @Prop()
  username: string; // User profile

  @Prop()
  displayName: string; // This can be overridden

  @Prop()
  email: string;

  @Prop()
  seenModal: boolean;

  @Prop()
  avatarImageUrl: string;

  @Prop()
  coverImageUrl: string;

  @Prop()
  aboutMe: string;

  @Prop()
  facebookLink: string;

  @Prop()
  twitterLink: string;

  @Prop()
  discordLink: string;

  @Prop()
  instagramLink: string;

  @Prop()
  tiktokLink: string;

  @Prop()
  youtubeLink: string;

  @Prop()
  telegramLink: string;

  @Prop({ default: 0 })
  sentTips: number;

  @Prop({ default: 0 })
  receivedTips: number;

  @Prop({ default: 0 })
  uploads: number; // Count of streams uploaded by the account

  @Prop({ default: 0 })
  followers: number;

  @Prop({ default: 0 })
  likes: number;

  @Prop({ type: Object, default: {} })
  customs: Record<string, any>;

  @Prop({ default: false })
  online: boolean; // Online status
}

// Create the schema
export const AccountSchema = SchemaFactory.createForClass(Account);

// Create an index on the address field for uniqueness
AccountSchema.index({ address: 1 }, { unique: true });
export const AccountModel: Model<AccountDocument> = mongoose.model<AccountDocument>('accounts', AccountSchema);
