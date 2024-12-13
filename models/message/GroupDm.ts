import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class GroupDM extends Document {
  @Prop({
    type: String,
    enum: ['group'],
    required: true,
    default: 'group',
  })
  conversationType: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  groupName: string; 
  @Prop({
    type: String,
    trim: true,
  })
  description: string; 
  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }],
  })
  members: mongoose.Schema.Types.ObjectId[];

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' })
  plan: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: [
      {
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
        content: { type: String, required: true, trim: true },
        isRead: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  })
  messages: {
    sender: mongoose.Schema.Types.ObjectId;
    content: string;
    isRead: boolean;
    createdAt: Date;
  }[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

const GroupDMSchema = SchemaFactory.createForClass(GroupDM);
export const GroupDMModel: Model<GroupDM> = mongoose.model<GroupDM>('groupDm', GroupDMSchema);
