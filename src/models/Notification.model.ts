import { Document, Schema, Types, model } from "mongoose";

export type NotificationCategory =
  | "deposit"
  | "withdraw"
  | "transfer"
  | "admin"
  | "other"
  | "profit"
  | "lottery"
  | "announcement"
  | "payment"
  | "bonus"
  | "package"
  | "kyc"
  | "spin_prize"
  | "refund"
  | "vip_tier";

export interface INotification extends Document {
  user_id: Types.ObjectId;
  role?: string;
  category?: NotificationCategory;
  title: string;
  message?: string;
  is_read: boolean;
  is_opened: boolean;
  is_new: boolean;
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
    },
    category: {
      type: String,
      enum: [
        "deposit",
        "withdraw",
        "transfer",
        "admin",
        "other",
        "profit",
        "lottery",
        "announcement",
        "payment",
        "bonus",
        "package",
        "kyc",
        "spin_prize",
        "vip_tier",
        "refund",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
    },
    is_read: {
      type: Boolean,
      default: false,
    },
    is_opened: {
      type: Boolean,
      default: false,
    },
    is_new: {
      type: Boolean,
      default: true,
    },
    url: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = model<INotification>(
  "Notification",
  notificationSchema
);
