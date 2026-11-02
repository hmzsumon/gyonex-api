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
