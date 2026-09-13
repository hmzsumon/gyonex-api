// src/utils/luckyEngine.ts
/* ── Lucky Card provably-fair + global prize-pool engine ────────────────
 * প্রতিটা কার্ডের নিজস্ব serverSeed + hash কেনার সময় তৈরি হয়। খোলার সময়
 * HMAC_SHA256(serverSeed, "clientSeed:nonce:0") থেকে deterministic [0,1)
 * float বের হয়, তা দিয়ে weighted prize tier বাছা যায় (legacy)। খোলার পর
 * serverSeed reveal হয় — যে কেউ verifyDraw() চালিয়ে ফলাফল মিলিয়ে দেখতে পারে।
 *
 * বর্তমান মডেল: ঘষলেই সরাসরি amount (USDT) — কোনো ম্যাচিং গেম নয়। আসল
 * ফলাফল global prize-pool accumulator থেকে আসে (নিচে spreadContribution /
 * pickReadyPool)।
 * ──────────────────────────────────────────────────────────────────── */

import crypto from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // O/0, I/1 বাদ

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const generateCardCode = (): string => `LC-${randomCode(4)}-${randomCode(4)}`;

export const sha256Hex = (input: unknown): string =>
  crypto.createHash("sha256").update(String(input)).digest("hex");

export const createSeedPair = (): { serverSeed: string; serverSeedHash: string } => {
  const serverSeed = crypto.randomBytes(32).toString("hex");
  return { serverSeed, serverSeedHash: sha256Hex(serverSeed) };
};

export const defaultClientSeed = (): string => crypto.randomBytes(8).toString("hex");

// serverSeed + clientSeed + nonce + cursor -> deterministic [0,1) float
function floatAt(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number,
): number {
  const hmac = crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest("hex");
  return parseInt(hmac.slice(0, 13), 16) / 2 ** 52;
}
export { floatAt };

/* ── weighted tier pick (legacy) ────────────────────────────────────────
 * tiers: [{ _id, label, symbol, amount, weight, stockLimit, stockUsed }]
 * stockLimit শেষ হওয়া টায়ার বাদ। কোনো টায়ার না থাকলে null (= কিছু না)।
 * ────────────────────────────────────────────────────────────────────── */
export const pickTier = (tiers: any[], r: number): any => {
  const pool = tiers.filter(
    (t) =>
      Number(t.weight) > 0 &&
      (t.stockLimit == null || Number(t.stockUsed || 0) < Number(t.stockLimit)),
  );
  if (pool.length === 0) return null;

  const total = pool.reduce((s, t) => s + Number(t.weight), 0);
  let pick = r * total;
  for (const t of pool) {
    if (pick < Number(t.weight)) return t;
    pick -= Number(t.weight);
  }
  return pool[pool.length - 1];
};

// তাত্ত্বিক RTP = গড় প্রাইজ / কার্ডের দাম (long-run, stock infinite ধরে)
export const theoreticalRtp = (tiers: any[], price: number): number => {
  const total = tiers.reduce((s, t) => s + Number(t.weight || 0), 0);
  if (!total || !price) return 0;
  const expected =
    tiers.reduce((s, t) => s + Number(t.amount || 0) * Number(t.weight || 0), 0) /
    total;
  return expected / price;
};

// ===== verifier — hash + প্রথম draw দিয়ে প্রাইজ amount মিলিয়ে দেখে (legacy) =====
export const verifyDraw = ({
  serverSeed,
  serverSeedHash,
  clientSeed,
  nonce,
  expectedAmount,
  tiers,
}: {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  expectedAmount: number;
  tiers: any[];
}) => {
  const hashOk = sha256Hex(serverSeed) === serverSeedHash;
  const total = tiers.reduce((s, t) => s + Number(t.weight || 0), 0);
  const r = floatAt(serverSeed, clientSeed, nonce, 0);
  let pick = r * total;
  let amount = tiers.length ? Number(tiers[0].amount) : 0;
  for (const t of tiers) {
    if (pick < Number(t.weight)) {
      amount = Number(t.amount);
      break;
    }
    pick -= Number(t.weight);
  }
  return {
    valid: hashOk && Math.abs(amount - Number(expectedAmount)) < 0.001,
    hashMatches: hashOk,
    recomputedAmount: amount,
  };
};

/* ══════════════════════════════════════════════════════════════════════
 * Global prize-pool engine (মূল লাকি কার্ড মডেল)
 * weighted random নয় — একটা deterministic accumulator। প্রতিটা কার্ড
 * স্ক্র্যাচে ওই কার্ডের unit offer-price percent অনুপাতে সব পুলে জমা হয়।
 * কোনো পুলের balance তার target amount ছুঁলে ওই ইউজার সেই প্রাইজ জেতে।
 * একসাথে একাধিক পুল রেডি হলে — শুধু সবচেয়ে বড় amount-এর পুলটা পে-আউট হয়,
 * বাকিগুলো ভরা থেকে যায়, পরের স্ক্র্যাচে ফায়ার করে (টাকা নষ্ট হয় না)।
 * ══════════════════════════════════════════════════════════════════════ */

const round4 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 1e4) / 1e4;
const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// contribution: number (কার্ডের unit offer price)
// pools: [{ code, percent, amount, balance, ... }]
// companyPercent: number
// -> { poolAdds: { <code>: <amount> }, companyAdd, totalSpread }
export const spreadContribution = (
  contribution: number,
  pools: any[],
  companyPercent: number,
) => {
  const c = Math.max(0, Number(contribution) || 0);
  const poolAdds: Record<string, number> = {};
  let totalSpread = 0;
  for (const p of pools) {
    const add = round4((c * (Number(p.percent) || 0)) / 100);
    poolAdds[p.code] = add;
    totalSpread += add;
  }
  const companyAdd = round4((c * (Number(companyPercent) || 0)) / 100);
  return { poolAdds, companyAdd, totalSpread: round4(totalSpread + companyAdd) };
};

// pools already-incremented — সবচেয়ে বড় amount-এর রেডি পুল ফেরত দেয়
export const pickReadyPool = (pools: any[]): any => {
  const ready = pools.filter(
    (p) =>
      p.isActive !== false &&
      Number(p.amount) > 0 &&
      Number(p.balance) >= Number(p.amount),
  );
  if (ready.length === 0) return null;
  ready.sort((a, b) => Number(b.amount) - Number(a.amount));
  return ready[0];
};

// admin পুল কনফিগ ভ্যালিডেশন
// rows: [{ code, label, amount, percent }]
export const validatePoolConfig = (rows: any[], companyPercent: number) => {
  const prizeSum = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  const grand = round4(prizeSum + (Number(companyPercent) || 0));
  const EPS = 1e-6;
  return {
    prizePercentSum: round4(prizeSum),
    companyFundPercent: round4(Number(companyPercent) || 0),
    grandTotalPercent: grand,
    over100: grand > 100 + EPS,
    exactly100: Math.abs(grand - 100) <= EPS,
    under100: grand < 100 - EPS,
    // remainder পুরোটা কোম্পানি ফান্ডে দিলে ঠিক ১০০% হয়
    suggestedCompanyFundPercent: round4(Math.max(0, 100 - prizeSum)),
  };
};

export const poolRound4 = round4;
export const poolRound2 = round2;
