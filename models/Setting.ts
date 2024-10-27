import mongoose, { Schema, Document, Model } from 'mongoose';

interface ISetting extends Document {
  lastFetchedBlock: Record<string, unknown>;
  lastBlockFetchedForTransfer: Record<string, unknown>;
  lastBlockFetchedForProtocolTx: Record<string, unknown>;
  syncedDiffTimeOfGraph: Record<string, unknown>;
}

const SettingSchema: Schema<ISetting> = new Schema(
  {
    lastFetchedBlock: { type: Object, required: true },
    lastBlockFetchedForTransfer: { type: Object, required: true },
    lastBlockFetchedForProtocolTx: { type: Object, required: true },
    syncedDiffTimeOfGraph: { type: Object, required: true },
  },
  { timestamps: true }
);

const Setting: Model<ISetting> = mongoose.model<ISetting>('settings', SettingSchema);

export default Setting;
