import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class SearchQuery extends Document {
  @Prop({ required: true, index: true })
  term: string;

  @Prop({ default: 1 })
  count: number;

  @Prop({ default: Date.now })
  lastSearchedAt: Date;

  @Prop({ required: false })
  address?: string;
}

export const SearchQuerySchema = SchemaFactory.createForClass(SearchQuery);

SearchQuerySchema.index({ term: 'text' });
SearchQuerySchema.index({ term: 1, count: -1 });
