// utils/generateAccountNumber.ts
import Counter from "../models/Counter.model";

export async function generateAccountNumber(): Promise<string> {
  const now = new Date();

  // YY (last 2 digits)
  const yy = String(now.getUTCFullYear()).slice(-2);

  // DDD (day-of-year 001..366)
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const doyNum = Math.floor((+now - startOfYear) / 86400000) + 1;
  const ddd = String(doyNum).padStart(3, "0");

  const dayKey = `accountNumber:${now.getUTCFullYear()}-${ddd}`;

  // ✅ no $setOnInsert on seq — avoid conflict
  const doc = await Counter.findOneAndUpdate(
    { key: dayKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  if (!doc) throw new Error("Counter upsert failed");
  if (doc.seq > 9999) throw new Error("Daily sequence overflow");

  const ssss = String(doc.seq).padStart(4, "0");
  return `${yy}${ddd}${ssss}`; // 9 digits
}
