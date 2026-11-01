export type ProfitPolicy = {
  effectiveDay: string;
  profitEnabled: boolean;
  profitDays: number[];
};

// Match the cron's Asia/Dhaka timezone regardless of the server timezone.
export const stakingDayKey = (date: Date) =>
  new Date(date.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function isStakingProfitDay(date: Date, history: ProfitPolicy[]) {
  const key = stakingDayKey(date);
  const policy = [...history].reverse().find((item) => item.effectiveDay <= key);
  if (!policy) return true; // Existing contracts before settings were introduced.
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
  return policy.profitEnabled && policy.profitDays.includes(weekday);
}

export function cancellationAmounts(principal: number, percent: number) {
  const penaltyQty = +((principal * percent) / 100).toFixed(8);
  return { penaltyQty, returnQty: +Math.max(0, principal - penaltyQty).toFixed(8) };
}

export function stakingCancellationDeadline(start: Date) {
 const d = new Date(start.getTime() + 21600000), day = d.getUTCDate();
 d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1);
 d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
 return new Date(d.getTime()-21600000);
}
export const stakingProfitCap = (principal: number) => +(principal * (principal <= 10000 ? 2.5 : 3.5)).toFixed(8);
