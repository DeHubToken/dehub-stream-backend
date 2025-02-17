import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model, ObjectId } from 'mongoose';
import Counter from './Counter';
import { ActivityActionType, ActivityModel } from './activity';

// Define the interface for the Plans document
export type PlansDocument = Plans & Document;

// Define the Plans schema
@Schema({ timestamps: true }) // Automatically manage createdAt and updatedAt fields
export class Plans {
  @Prop({ unique: true })
  id: string;

  // Reference to the Account model
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Account' })
  userId: ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop()
  address: string;

  @Prop({ required: true })
  duration: number;

  @Prop({ required: true })
  tier: number;

  @Prop({ type: [String], default: [] })
  benefits: string[];

  @Prop({
    type: [
      {
        chainId: { type: Number, required: true },
        token: { type: String, required: true },
        price: { type: Number, required: true },
        isPublished: { type: Boolean, default: false },
        status: { type: Boolean, default: false },
      },
    ],
    default: [],
    required: true,
    _id: false, // Prevent the creation of _id field for each item in the array
  })
  chains: Array<{
    _id: { type: String; select: false };
    chainId: number;
    token: string;
    price: number;
    isPublished: boolean;
    status: boolean;
  }>;
}

// Create the Plans schema
export const PlansSchema = SchemaFactory.createForClass(Plans);

PlansSchema.pre('save', async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'plans' }, // Plan counter identifier
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      this.id = counter.seq;
    } catch (error) {
      return next(error);
    }
  } else if (this.isModified('chains') && this.chains.some(p => p.isPublished === true)) {
    try {
      await new ActivityModel({
        planId: this._id,
        userId: this.userId,
        type: ActivityActionType.CREATE_PLAN
      }).save();
    } catch (error) {
      return next(error);
    }
  }

  next();
});

// Create the model
export const PlansModel: Model<PlansDocument> = mongoose.model<PlansDocument>('Plans', PlansSchema);
