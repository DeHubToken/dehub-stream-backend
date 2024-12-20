import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true })
  sender: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'DM', required: true })
  conversation: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: String, 
    trim: true,
  })
  content: string; 
  @Prop({
    type: [String],
    validate: {
      validator: function (value: string[]) {
        if (
          this.msgType === 'gif' ||
          this.msgType === 'image' ||
          this.msgType === 'video' ||
          this.msgType === 'audio' ||
          this.msgType === 'mixed'
        ) {
          return value && value.length > 0;
        }
        return true;
      },
      message: 'At least one media URL is required for GIF, image, video, audio, or mixed messages.',
    },
  })
  mediaUrls: string[]; // Array to store one or more media URLs

  @Prop({
    type: String,
    enum: ['msg', 'gif', 'image', 'video', 'audio', 'mixed'],
    default: 'msg',
  })
  msgType: 'msg' | 'gif' | 'image' | 'video' | 'audio' | 'mixed';

  @Prop({ type: Boolean, default: false })
  isRead: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Export model
export const MessageModel: Model<Message> = mongoose.model<Message>('Message', MessageSchema);
