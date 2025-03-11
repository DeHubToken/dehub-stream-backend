import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class DmSetting extends Document {
  @Prop({
    type: String, // Address should be a string, not ObjectId
    required: true,
    unique: true, // Ensures one setting per address
  })
  address: string;

  @Prop({
    type: [String],
    enum: ['NEW_DM', 'ALL'],
    default: [],
  })
  disables: string[];
}

export const DmSettingSchema = SchemaFactory.createForClass(DmSetting);
export const DmSettingModel: Model<DmSetting> = mongoose.model<DmSetting>('dm_setting', DmSettingSchema);
