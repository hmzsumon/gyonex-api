/* ────────── comments ────────── */
/* Single source of truth for rank targets & rewards. */
/* ────────── comments ────────── */
import { RankKey } from "@/types/rank";

export const RANKS: Readonly<
  {
    key: RankKey;
    directRefTarget: number;
    minInvestTarget: number;
    rewardUsd: number;
  }[]
> = [
  { key: "bronze", directRefTarget: 10, minInvestTarget: 1000, rewardUsd: 50 },
  { key: "silver", directRefTarget: 20, minInvestTarget: 3000, rewardUsd: 100 },
  { key: "gold", directRefTarget: 30, minInvestTarget: 6000, rewardUsd: 300 },
  {
    key: "platinum",
    directRefTarget: 35,
    minInvestTarget: 11000,
    rewardUsd: 500,
  },
  {
    key: "diamond",
    directRefTarget: 50,
    minInvestTarget: 21000,
    rewardUsd: 1000,
  },
  {
    key: "emerald",
    directRefTarget: 55,
    minInvestTarget: 35000,
    rewardUsd: 2000,
  },
  {
    key: "grandmaster",
    directRefTarget: 60,
    minInvestTarget: 55000,
    rewardUsd: 5000,
  },
];
