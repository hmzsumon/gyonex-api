// src/types/wheel.ts
import { Types } from "mongoose";

export type BetInput = {
  segmentId: number;
  amount: number;
};

export type Outcome = {
  segmentId: number;
  baseMulti?: number;
  finalMulti: number; // used for payout calculation
  angle?: number;
};

export type RoundStatus = "open" | "settled" | "void";

export interface WheelRoundDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  customerId: Types.ObjectId;
  gameKey: string;
  bets: BetInput[];
  totalStake: number;
  outcome?: Outcome;
  payout?: number;
  net?: number; // payout - totalStake
  status: RoundStatus;
  settledAt?: Date;
  txIds?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}
