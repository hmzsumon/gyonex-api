// constants/wheel.ts
export const SEGMENTS_12 = [
  { id: 1, multi: 2.5, emoji: "🦁", result: "Lion", dig: 0 },
  { id: 2, multi: 2, emoji: "🐯", result: "Tiger", dig: 30 },
  { id: 3, multi: 2.5, emoji: "🐘", result: "Elephant", dig: 60 },
  { id: 4, multi: 2, emoji: "🐻", result: "Bear", dig: 90 },
  { id: 5, multi: 4, emoji: "🐴", result: "Horse", dig: 120 },
  { id: 6, multi: 4, emoji: "🦊", result: "Fox", dig: 150 },
  { id: 7, multi: 5, emoji: "🐰", result: "Rabbit", dig: 180 },
  { id: 8, multi: 3, emoji: "🐺", result: "Wolf", dig: 210 },
  { id: 9, multi: 5.5, emoji: "🐒", result: "Monkey", dig: 240 },
  { id: 10, multi: 3, emoji: "🐄", result: "Cow", dig: 270 },
  { id: 11, multi: 2, emoji: "🐖", result: "Pig", dig: 300 },
  { id: 12, multi: 3, emoji: "🐆", result: "Leopard", dig: 330 },
];

export const SEGMENT_MAP = new Map(SEGMENTS_12.map((s) => [s.id, s]));
export const ALLOWED_SEGMENT_IDS = new Set(SEGMENTS_12.map((s) => s.id));
export const ALLOWED_MULTIS = new Set(SEGMENTS_12.map((s) => s.multi)); // => {12,4,6,3}
