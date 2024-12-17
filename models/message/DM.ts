import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class DM extends Document {
  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }],
  })
  participants: mongoose.Schema.Types.ObjectId[];

  @Prop({
    type: String,
    enum: ['group', 'dm'],
    required: true,
    default: 'dm',
  })
  conversationType: string;

  @Prop({
    type: String,
    trim: true,
  })
  description: string;

  @Prop({
    type: String,
    trim: true,
    validate: {
      validator: function (this: DM, value: string) {
        // Make groupName required only if conversationType is 'group'
        if (this.conversationType === 'group' && !value) {
          return false; // Fail validation if no groupName for 'group'
        }
        return true;
      },
      message: 'Group name is required when conversation type is "group".',
    },
  })
  groupName: string;

  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: false }],
  })
  plans: mongoose.Schema.Types.ObjectId[];

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: mongoose.Schema.Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  lastMessageAt: Date;
}

export const DMSchema = SchemaFactory.createForClass(DM);

// Correct export for the Model
export const DmModel: Model<DM> = mongoose.model<DM>('dm', DMSchema);
