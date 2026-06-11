// models/Counter.model.ts
import { Document, Schema, model } from "mongoose";

export interface ICounter extends Document {
  key: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  key: { type: String, unique: true, index: true, required: true },
  seq: { type: Number, default: 0 },
});

export default model<ICounter>("Counter", counterSchema);
