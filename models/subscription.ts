import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model, ObjectId } from 'mongoose';
import Counter from './Counter';
import { ActivityActionType, ActivityModel } from './activity';

// Define the interface for the Subscription document
export type SubscriptionDocument = Subscription & Document;

@Schema({ timestamps: true }) // Automatically manage createdAt and updatedAt fields
export class Subscription extends Document{
  @Prop({ unique: true })
  id: string; // Unique subscription ID

  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Account' })
  userId: ObjectId; // Reference to the Account model

  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Plans' })
  planId: ObjectId; // Reference to the Plans model

  @Prop({ required: false })
  startDate: Date; // Subscription start date

  @Prop()
  endDate: Date; // Subscription end date (nullable for lifetime plans)

  @Prop({ required: true, default: false })
  active: boolean; // Status of the subscription

  @Prop({
    type: {
      chainId: { type: Number, required: true },
      token: { type: String, required: true },
      price: { type: Number, required: true },
      paymentTimestamp: { type: Date, default: Date.now },
    },
    // required: true,
    _id: false, // Prevents MongoDB from creating an _id field for this nested document
  })
  paymentDetails: {
    chainId: number; // Blockchain chain ID
    token: string; // Token used for payment
    price: number; // Payment amount
    paymentTimestamp: Date; // Payment timestamp
  };
}

// Create the Subscription schema
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Pre-save hook for auto-incrementing the subscription ID
SubscriptionSchema.pre('save', async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'subscriptions' }, // Subscription counter identifier
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );

      this.id = counter.seq.toString(); // Assign auto-incremented ID
    } catch (error:any) {
      next(error);
    }
  } else {
    // Log activity only if the subscription is active
    if (this.active === true) {
      await new ActivityModel({
        planId: this.planId,
        userId: this.userId,
        type: ActivityActionType.PURCHASE_PLAN,
      }).save();
    }

    next();
  }
});

// Create the model
export const SubscriptionModel: Model<SubscriptionDocument> = mongoose.model<SubscriptionDocument>(
  'Subscription',
  SubscriptionSchema,
);
