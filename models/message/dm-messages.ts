import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true })
  sender: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'DM', required: true })
  conversation: mongoose.Schema.Types.ObjectId;

  @Prop({ type: String, trim: true })
  content: string;

  @Prop({
    type: [
      {
        isLocked: { type: Boolean, required: true },
        amount: { type: String, required: true },
        address: { type: String, required: true },
        chainId: { type: Number, required: true },
      },
    ],
  })
  purchaseOptions: {
    amount: string;
    address: string;
    chainId: number;
  }[];
  @Prop({
    type: [
      {
        url: { type: String, required: true }, // URL of the media
        type: { type: String, required: true }, // Type of the media (e.g., 'image', 'video', etc.)
        mimeType: { type: String, required: true }, // MIME type of the file (e.g., 'image/jpeg', 'video/mp4', etc.)
      },
    ],
  })
  mediaUrls: {
    url: string;
    type: string;
    mimeType: string;
  }[]; // Array of media objects with additional details

  @Prop({
    type: String,
    enum: ['simple', 'pending', 'success', 'failure'],
    default: 'simple',
  })
  uploadStatus: 'simple' | 'pending' | 'success' | 'failure';

  @Prop({
    type: String,
    enum: ['msg', 'gif', 'media'],
    default: 'msg',
  })
  msgType: 'msg' | 'media' | 'gif';

  @Prop({ type: Boolean, default: false })
  isRead: boolean;
  @Prop({ type: Boolean, default: false })
  isPaid: boolean;
  @Prop({ type: Boolean, default: false })
  isUnLocked: boolean;
  @Prop({ type: String, default: null })
  failureReason: string; // Field to store error details in case of failure
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Export model
export const MessageModel: Model<Message> = mongoose.model<Message>('Message', MessageSchema);
