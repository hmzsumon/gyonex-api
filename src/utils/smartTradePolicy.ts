export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function smartTradeCap(principal: number) {
  return money(principal * (principal <= 10000 ? 2.5 : 3.5));
}

// One calendar month in Bangladesh time; Jan 31 ends on Feb 28/29.
export function cancellationDeadline(start: Date) {
  const d = new Date(start.getTime() + 21600000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return new Date(d.getTime() - 21600000);
}

export function smartTradePayout(principal: number, earned: number, gross: number) {
  const user = money(Math.min(Math.max(0, smartTradeCap(principal) - earned), Math.max(0, gross) * 0.6));
  const eligibleGross = user / 0.6;
  return { user, parents: money(eligibleGross * 0.2), company: money(eligibleGross * 0.2) };
}

// Take profit is a net USDT amount, never a raw price delta.
export function smartTpPrice(pos: { entryPrice: number; side: string; lots: number;
  contractSize?: number; commissionOpen?: number; commissionClose?: number; takeProfit?: number }) {
  const qty = pos.lots * (pos.contractSize ?? 1);
  const tp = Number(pos.takeProfit);
  if (!(qty > 0) || !Number.isFinite(qty) || !(tp > 0) || !Number.isFinite(tp)) return NaN;
  const delta = (tp + (pos.commissionOpen || 0) + (pos.commissionClose || 0)) / qty;
  return pos.side === "buy" ? pos.entryPrice + delta : pos.entryPrice - delta;
}
