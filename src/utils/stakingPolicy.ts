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
