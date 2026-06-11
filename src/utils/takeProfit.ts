// src/utils/takeProfit.ts
export type Side = "buy" | "sell";

/** গ্রস PnL (commission বাদে) — entry বনাম closeQuote */
export function grossPnlAt(params: {
  entryPrice: number;
  closePrice: number;
  side: Side;
  lots: number;
  contractSize: number; // crypto=1, XAU=100 ...
}) {
  const { entryPrice, closePrice, side, lots, contractSize } = params;
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(closePrice) ||
    !Number.isFinite(lots) ||
    !Number.isFinite(contractSize)
  )
    return NaN;

  const qty = lots * contractSize;
  const diff =
    side === "buy" ? closePrice - entryPrice : entryPrice - closePrice;
  return diff * qty;
}

/** নেট PnL = গ্রস − (commissionOpen + commissionClose) */
export function netPnlAt(params: {
  entryPrice: number;
  closePrice: number;
  side: Side;
  lots: number;
  contractSize: number;
  commissionOpen?: number;
  commissionClose?: number;
}) {
  const gross = grossPnlAt(params);
  if (!Number.isFinite(gross)) return NaN;
  const fees = (params.commissionOpen || 0) + (params.commissionClose || 0);
  return gross - fees;
}

/** 2 decimal রাউন্ড */
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
