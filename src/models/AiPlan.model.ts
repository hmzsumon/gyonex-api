/* ──────────────────────────────────────────────────────────────────────────
   AI Plan Model
────────────────────────────────────────────────────────────────────────── */
import { Document, model, Schema } from "mongoose";

export interface IAiPlanRow {
  label: string;
  value: string;
}

export interface IAiPlan extends Document {
  key: string;
  title: string;
  subtitle: string;
  amount: number;
  rows: IAiPlanRow[];
  isActive: boolean;
  sortOrder: number;
}

const aiPlanRowSchema = new Schema<IAiPlanRow>(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const aiPlanSchema = new Schema<IAiPlan>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    rows: {
      type: [aiPlanRowSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true },
);

export default model<IAiPlan>("AiPlan", aiPlanSchema);
