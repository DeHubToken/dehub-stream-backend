import mongoose, { Schema, Document, Model } from 'mongoose';

export enum ReactionType {
  Like = 'LIKE',
  UnLike = 'UNLIKE',
}

export enum ReactionSubjectType {
  Message = 'MSG',
  Comment = 'COMMENT',
}


interface IReaction extends Document {
  addresses: string[];
  subjectId: string;
  type: ReactionType;
  value: number;
  subjectType: ReactionSubjectType;
}

const ReactionSchema: Schema<IReaction> = new Schema(
  {
    addresses: [{ type: String, lowercase: true, required: true }],
    subjectId: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(ReactionType),
      default: ReactionType.Like,
      index: true,
    },
    value: { type: Number, required: true },
    subjectType: {
      type: String,
      enum: Object.values(ReactionSubjectType),
      default: ReactionSubjectType.Message,
      index: true,
    },
  },
  { timestamps: true }
);

const Reaction: Model<IReaction> = mongoose.model<IReaction>('reactions', ReactionSchema);

export default Reaction;
