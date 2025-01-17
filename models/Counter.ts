
// Counter schema for auto-increment
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Model, ObjectId } from 'mongoose';
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  });
  
  const Counter = mongoose.model('Counter', counterSchema);
  export default Counter