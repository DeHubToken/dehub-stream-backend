import { IDCounterModel } from './IDCounter';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true })
export class Category   extends Document {
  @Prop({ unique: true, required: true })
  name: string;

  @Prop()
  id: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Pre-save middleware to generate a unique ID
CategorySchema.pre<CategoryDocument>('save', async function (next) {
  const doc = this;

  if (!doc.id) {
    try {
      const counter = await IDCounterModel.findOneAndUpdate(
        { id: 'categoryId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      doc.id = counter?.seq ?? 0; // Fallback to 0 if counter is undefined
      next();
    } catch (error:any) {
      next(error);
    }
  } else {
    next();
  }
});

// Create a unique index on the name field
CategorySchema.index({ name: 1 }, { unique: true });

// Export the model type and schema 
export const CategoryModel = mongoose.model<CategoryDocument>('categories', CategorySchema);
