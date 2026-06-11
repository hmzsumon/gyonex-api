/* ──────────────────────────────────────────────────────────────────────────
   Account Type Config (Standard / Pro)
   NOTE: UI-র লিস্ট = ব্যাকএন্ডের allowedLeverages — দুটো একই রাখুন।
────────────────────────────────────────────────────────────────────────── */
export type TAccountType = "standard" | "pro";

type Base = {
  title: string;
  defaultLeverage: number;
  /** UI/BE দু’জায়গায় একই তালিকা */
  allowedLeverages: number[]; // e.g. [2,20,50,100,200,400,500,600,800,1000,2000]
  commissionPerLot: number;
  minSpreadPips: number;
  minBalance: number;
  maxAccountsPerUser: number;
  supportsUnlimited: boolean;
  maxLeverage: number; // unlimited হলে এই মান ব্যবহার হবে (e.g. 2000)
  mode: "real" | "demo";
};

export const ACCOUNT_TYPES: Record<TAccountType, Base> = {
  standard: {
    title: "Standard",
    defaultLeverage: 500,
    allowedLeverages: [2, 20, 50, 100, 200, 400, 500, 600, 800, 1000, 2000],
    commissionPerLot: 0,
    minSpreadPips: 10,
    minBalance: 0,
    maxAccountsPerUser: 5,
    supportsUnlimited: true,
    maxLeverage: 2000,
    mode: "real",
  },
  pro: {
    title: "Pro",
    defaultLeverage: 200,
    allowedLeverages: [2, 20, 50, 100, 200, 400, 500, 600, 800, 1000, 2000],
    commissionPerLot: 3.5,
    minSpreadPips: 0,
    minBalance: 0,
    maxAccountsPerUser: 5,
    supportsUnlimited: true,
    maxLeverage: 2000,
    mode: "real",
  },
};
