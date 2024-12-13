import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class DM extends Document {
  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }],
  })
  participants: mongoose.Schema.Types.ObjectId[];
  @Prop({ type: Date, default: Date.now })
  lastMessageAt: Date;
}

export const DMSchema = SchemaFactory.createForClass(DM);

// Correct export for the Model
export const DmModel: Model<DM> = mongoose.model<DM>('dm', DMSchema);
