// src/models/kyc.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export type KycStatus = "draft" | "pending" | "approved" | "rejected";

export interface IKyc extends Document {
  user: mongoose.Types.ObjectId;

  first_name: string;
  last_name: string;
  date_of_birth: string;
  country_of_birth: string;
  gender: string;
  residential_address: string;

  document_type: string;
  issuing_country: string;

  front_image: string;
  front_image_public_id: string;

  back_image: string;
  back_image_public_id: string;

  selfie_image: string;
  selfie_image_public_id: string;

  status: KycStatus;
  reject_reason: string;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  approved_at: Date | null;
  rejected_at: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

const kycSchema = new Schema<IKyc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    first_name: { type: String, default: "" },
    last_name: { type: String, default: "" },
    date_of_birth: { type: String, default: "" },
    country_of_birth: { type: String, default: "" },
    gender: { type: String, default: "" },
    residential_address: { type: String, default: "" },

    document_type: { type: String, default: "" },
    issuing_country: { type: String, default: "" },

    front_image: { type: String, default: "" },
    front_image_public_id: { type: String, default: "" },

    back_image: { type: String, default: "" },
    back_image_public_id: { type: String, default: "" },

    selfie_image: { type: String, default: "" },
    selfie_image_public_id: { type: String, default: "" },

    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "draft",
    },

    reject_reason: { type: String, default: "" },
    submitted_at: { type: Date, default: null },
    reviewed_at: { type: Date, default: null },
    approved_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
  },
  { timestamps: true },
);

const Kyc: Model<IKyc> =
  mongoose.models.Kyc || mongoose.model<IKyc>("Kyc", kycSchema);

export default Kyc;
