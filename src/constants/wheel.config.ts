// src/constants/wheel.config.ts
// Unified multi-game config + helpers

export type Segment = {
  id: number;
  label: string;
  emoji?: string;
  multi: number; // multiplier (eg. 2, 3.5, etc.)
  angle: number; // center angle used by your UI (0..359)
};

export type GameConfig = {
  key: string; // stable identifier used in URLs (":gameKey")
  name: string; // display name
  segments: Segment[];
  minBet?: number; // optional per-bet minimum
  maxBet?: number; // optional per-bet maximum
  maxTotalStake?: number; // optional per-round stake cap
};

// --- Example: from your current /constants/wheel.ts (12 animals) ---
const ANIMALS_12: Segment[] = [
  { id: 1, multi: 2.5, emoji: "🦁", label: "Lion", angle: 0 },
  { id: 2, multi: 2, emoji: "🐯", label: "Tiger", angle: 30 },
  { id: 3, multi: 2.5, emoji: "🐘", label: "Elephant", angle: 60 },
  { id: 4, multi: 2, emoji: "🐻", label: "Bear", angle: 90 },
  { id: 5, multi: 4, emoji: "🐴", label: "Horse", angle: 120 },
  { id: 6, multi: 4, emoji: "🦊", label: "Fox", angle: 150 },
  { id: 7, multi: 5, emoji: "🐰", label: "Rabbit", angle: 180 },
  { id: 8, multi: 3, emoji: "🐺", label: "Wolf", angle: 210 },
  { id: 9, multi: 5.5, emoji: "🐒", label: "Monkey", angle: 240 },
  { id: 10, multi: 3, emoji: "🐄", label: "Cow", angle: 270 },
  { id: 11, multi: 2, emoji: "🐖", label: "Pig", angle: 300 },
  { id: 12, multi: 3, emoji: "🐆", label: "Leopard", angle: 330 },
];

// Another example game (fruit-loops style, 6 segments):
const FRUITS_6: Segment[] = [
  { id: 1, multi: 2.9, label: "Apple 🍎", angle: 0 },
  { id: 2, multi: 2.9, label: "Mango 🥭", angle: 60 },
  { id: 3, multi: 2.9, label: "Watermelon 🍉", angle: 120 },
  { id: 4, multi: 2.9, label: "Apple 🍎", angle: 180 },
  { id: 5, multi: 2.9, label: "Mango 🥭", angle: 240 },
  { id: 6, multi: 2.9, label: "Watermelon 🍉", angle: 300 },
];

// Add as many games as you need here (or load from DB later)
export const GAMES: Record<string, GameConfig> = {
  "crazy-lion": {
    key: "crazy-lion",
    name: "Crazy Lion",
    segments: ANIMALS_12,
    minBet: 1,
    maxBet: 1_000_000,
    maxTotalStake: 2_000_000,
  },
  "fruit-loops-6": {
    key: "fruit-loops-6",
    name: "Fruit Loops (6)",
    segments: FRUITS_6,
    minBet: 1,
    maxBet: 1_000_000,
    maxTotalStake: 2_000_000,
  },
  "lucky-time": {
    key: "lucky-time",
    name: "Lucky Time",
    segments: [
      { id: 1, multi: 10, emoji: "C", label: "c", angle: 0 },
      { id: 2, multi: 10, emoji: "K", label: "k", angle: 30 },
      { id: 3, multi: 10, emoji: "Y", label: "y", angle: 60 },
      { id: 4, multi: 0, emoji: "0", label: "0", angle: 90 },
      { id: 5, multi: 2, emoji: "1️⃣", label: "1", angle: 120 },
      { id: 6, multi: 3, emoji: "2️⃣", label: "2", angle: 150 },
      { id: 7, multi: 4, emoji: "3️⃣", label: "3", angle: 180 },
      { id: 8, multi: 5, emoji: "5️⃣", label: "5", angle: 210 },
      { id: 9, multi: 10, emoji: "🔟", label: "10", angle: 240 },
      { id: 10, multi: 0, emoji: "0️⃣", label: "0", angle: 270 },
      { id: 11, multi: 2, emoji: "L", label: "l", angle: 300 },
      { id: 12, multi: 10, emoji: "U", label: "u", angle: 330 },
    ],
    minBet: 1,
    maxBet: 500_000,
    maxTotalStake: 1_000_000,
  },
};

export function getGameConfig(gameKey: string): GameConfig | undefined {
  return GAMES[gameKey];
}

export function segmentMap(gameKey: string) {
  const cfg = getGameConfig(gameKey);
  if (!cfg) return new Map<number, Segment>();
  return new Map(cfg.segments.map((s) => [s.id, s]));
}

export function allowedSegmentIds(gameKey: string) {
  const cfg = getGameConfig(gameKey);
  if (!cfg) return new Set<number>();
  return new Set(cfg.segments.map((s) => s.id));
}
