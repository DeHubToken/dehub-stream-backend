import mongoose, { Document, Model } from 'mongoose';

export interface IDCounter {
  id: string;
  seq: number;
  expiredIds: number[];
}

const IDCounterSchema = new mongoose.Schema<IDCounter>({
  id: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
  expiredIds: { type: [Number], default: [] },
});

IDCounterSchema.index({ id: 1 }, { unique: true });

export const IDCounterModel: Model<IDCounter & Document> = mongoose.models.id_counters || mongoose.model<IDCounter & Document>('id_counters', IDCounterSchema);
