import mongoose, { Schema, Document } from 'mongoose';

interface INotification extends Document {
  address: string;
  tokenId: string | undefined | null | number; // Specify the type according to your needs
  type: string; // like, dislike, tip, comment, following, videoRemoval
  content: string;
  createdAt: Date;
  read: boolean;
}

const NotificationSchema = new Schema<INotification>(
  {
    address: { type: String, required: true },
    tokenId: { type: Schema.Types.Mixed, required: false }, // Use Mixed type for flexibility
    type: { type: String, required: true }, // Ensure to set validation as needed
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>('notifications', NotificationSchema);
