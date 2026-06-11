import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPaymentMethod extends Document {
  userId: Types.ObjectId;
  accountNumber: string;
  methodName: string;
  methodType: "personal" | "agent" | "payment";
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  totalReceiveAmount: number;
  agentName?: string; // Optional field for agent name
  agentId?: Types.ObjectId; // Optional field for agent ID
  customerId?: string; // Optional field for customer ID
}

const paymentMethodSchema = new Schema<IPaymentMethod>({
  accountNumber: { type: String, required: true },
  methodName: { type: String, required: true },
  methodType: {
    type: String,
    enum: ["personal", "agent", "payment"],
    required: true,
  },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  totalReceiveAmount: { type: Number, default: 0 },
  agentName: { type: String }, // Optional field for agent name
  agentId: { type: Schema.Types.ObjectId, ref: "User" }, // Optional field for agent ID
  customerId: { type: String }, // Optional field for customer ID
});

const PaymentMethod = mongoose.model<IPaymentMethod>(
  "PaymentMethod",
  paymentMethodSchema
);

export default PaymentMethod;
