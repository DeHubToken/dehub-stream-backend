import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model } from 'mongoose';

export enum REPORT_TYPE {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  INAPPROPRIATE_CONTENT = 'inappropriate content',
  OTHER = 'other',
}

export enum ACTION_TYPE {
  REPORT = 'report',
  BLOCK = 'block',
  BLOCKED = 'blocked', // Admin-initiated block
  UNBLOCKED = 'unblocked', // Admin-initiated block
}

@Schema({ timestamps: true })
export class UserReport extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
  })
  reportedBy: mongoose.Schema.Types.ObjectId; // User or admin initiating the action

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
  })
  reportedUser: mongoose.Schema.Types.ObjectId;
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
  })
  userReportedBy: mongoose.Schema.Types.ObjectId; // User being reported or blocked

  @Prop({
    type: String,
    enum: Object.values(ACTION_TYPE), // Enum values: block, blocked, report
    required: true,
  })
  action: ACTION_TYPE; // Action type (e.g., block, blocked, report)

  @Prop({
    type: String,
    trim: true,
  })
  reason: string; // Optional: Reason provided for blocking or reporting

  @Prop({
    type: String,
    enum: Object.values(REPORT_TYPE), // Enum values: spam, harassment, etc.
    required: false,
  })
  reportCategory: REPORT_TYPE; // Report category for "report" actions

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DM',
    required: false,
  })
  conversation: mongoose.Schema.Types.ObjectId; // Specific group or conversation where the action occurred

  @Prop({
    type: Boolean,
    default: false,
  })
  resolved: boolean; // Indicates if the report/block has been addressed by admins

  @Prop({
    type: Boolean,
    default: false,
  })
  isGlobal: boolean; // Indicates if the block is platform-wide (e.g., admin-global block)
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    required: false,
  })
  lastMessage: mongoose.Schema.Types.ObjectId; // Specific group or conversation where the action occurred
}

export const UserReportSchema = SchemaFactory.createForClass(UserReport);

// Create a unique index to prevent duplicate entries
UserReportSchema.index({ reportedBy: 1, reportedUser: 1, action: 1 }, { unique: true });

export const UserReportModel: Model<UserReport> = mongoose.model<UserReport>('UserReport', UserReportSchema);
