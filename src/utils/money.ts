// src/utils/money.ts
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
export function num(x: any, dflt = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : dflt;
}
