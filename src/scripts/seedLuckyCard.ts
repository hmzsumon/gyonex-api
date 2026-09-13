// src/scripts/seedLuckyCard.ts
/* ── One-off seed script: Lucky Card catalog + default global prize pool ──
 * এই স্ক্রিপ্ট gyonex-এর নিজস্ব (local dev) ডাটাবেসে adnexa-তে থাকা ঠিক
 * সেই একই লাকি কার্ড ক্যাটালগ (Lucky Mini / Lucky Star / Lucky Gold —
 * প্যাকেজ + legacy tiers) এবং ডিফল্ট A–I গ্লোবাল প্রাইজ পুল বসিয়ে দেয়।
 * (catchAsync-wrapped controller বাইপাস করে সরাসরি model অপারেশন — যাতে
 * script টা নিশ্চিতভাবে সব await শেষ করেই এক্সিট করে।)
 *
 * চালানোর নিয়ম (project root: gyonex-api):
 *   npx ts-node --files -r tsconfig-paths/register src/scripts/seedLuckyCard.ts
 * ────────────────────────────────────────────────────────────────────── */

import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "src/config/config.env" });
}

import { connectDB } from "@/config/db";
import LuckyCardType from "@/models/LuckyCardType.model";
import LuckyPackage from "@/models/LuckyPackage.model";
import LuckyPoolConfig from "@/models/LuckyPoolConfig.model";
import LuckyPrizePool from "@/models/LuckyPrizePool.model";
import LuckyPrizeTier from "@/models/LuckyPrizeTier.model";
import mongoose from "mongoose";

const DEFAULT_POOLS = [
  { code: "A", label: "Prize A", symbol: "🎈", amount: 50, percent: 25, sortOrder: 0 },
  { code: "B", label: "Prize B", symbol: "🎀", amount: 100, percent: 20, sortOrder: 1 },
  { code: "C", label: "Prize C", symbol: "🎁", amount: 300, percent: 16, sortOrder: 2 },
  { code: "D", label: "Prize D", symbol: "💵", amount: 1000, percent: 12, sortOrder: 3 },
  { code: "E", label: "Prize E", symbol: "💰", amount: 2500, percent: 9, sortOrder: 4 },
  { code: "F", label: "Prize F", symbol: "🏆", amount: 20000, percent: 7, sortOrder: 5 },
  { code: "G", label: "Prize G", symbol: "👑", amount: 50000, percent: 5, sortOrder: 6 },
  { code: "H", label: "Prize H", symbol: "💎", amount: 100000, percent: 2, sortOrder: 7 },
  { code: "I", label: "Prize I", symbol: "🌟", amount: 1000000, percent: 0.001, sortOrder: 8 },
];
const DEFAULT_COMPANY_FUND_PERCENT = 3.999;

const CATALOG = [
  {
    key: "lucky-mini",
    name: "Lucky Mini",
    price: 20,
    accent: "#22C55E",
    targetRtp: 80,
    displayTopPrize: 500000,
    sortOrder: 0,
    tiers: [
      { label: "No win", symbol: "🪙", amount: 0, weight: 5600 },
      { label: "10 USDT", symbol: "🪙", amount: 10, weight: 3000 },
      { label: "25 USDT", symbol: "💵", amount: 25, weight: 900 },
      { label: "60 USDT", symbol: "💸", amount: 60, weight: 350 },
      { label: "200 USDT", symbol: "💰", amount: 200, weight: 110 },
      { label: "1000 USDT", symbol: "👑", amount: 1000, weight: 34 },
      { label: "5000 USDT Jackpot", symbol: "💎", amount: 5000, weight: 6, stockLimit: 12, isJackpot: true },
    ],
    packages: [
      { name: "3 Cards", cardCount: 3, bonusCards: 0, regularPrice: 75, price: 60, sortOrder: 0 },
      { name: "5 Cards", cardCount: 5, bonusCards: 0, regularPrice: 125, price: 95, sortOrder: 1 },
      { name: "10 + 1 Cards", cardCount: 10, bonusCards: 1, regularPrice: 240, price: 180, sortOrder: 2 },
    ],
  },
  {
    key: "lucky-star",
    name: "Lucky Star",
    price: 50,
    accent: "#7C5CFC",
    targetRtp: 82,
    displayTopPrize: 1500000,
    sortOrder: 1,
    tiers: [
      { label: "No win", symbol: "🪙", amount: 0, weight: 6000 },
      { label: "25 USDT", symbol: "🪙", amount: 25, weight: 2600 },
      { label: "60 USDT", symbol: "💵", amount: 60, weight: 900 },
      { label: "150 USDT", symbol: "💸", amount: 150, weight: 350 },
      { label: "600 USDT", symbol: "💰", amount: 600, weight: 110 },
      { label: "2500 USDT", symbol: "👑", amount: 2500, weight: 34 },
      { label: "15000 USDT Jackpot", symbol: "💎", amount: 15000, weight: 6, stockLimit: 8, isJackpot: true },
    ],
    packages: [
      { name: "3 Cards", cardCount: 3, bonusCards: 0, regularPrice: 190, price: 150, sortOrder: 0 },
      { name: "5 Cards", cardCount: 5, bonusCards: 0, regularPrice: 300, price: 240, sortOrder: 1 },
      { name: "10 + 1 Cards", cardCount: 10, bonusCards: 1, regularPrice: 600, price: 460, sortOrder: 2 },
    ],
  },
  {
    key: "lucky-gold",
    name: "Lucky Gold",
    price: 100,
    accent: "#F5B93B",
    targetRtp: 80,
    displayTopPrize: 2500000,
    sortOrder: 2,
    tiers: [
      { label: "No win", symbol: "🪙", amount: 0, weight: 5700 },
      { label: "50 USDT", symbol: "🪙", amount: 50, weight: 2800 },
      { label: "120 USDT", symbol: "💵", amount: 120, weight: 900 },
      { label: "300 USDT", symbol: "💸", amount: 300, weight: 400 },
      { label: "1000 USDT", symbol: "💰", amount: 1000, weight: 150 },
      { label: "3500 USDT", symbol: "👑", amount: 3500, weight: 45 },
      { label: "25000 USDT Jackpot", symbol: "💎", amount: 25000, weight: 5, stockLimit: 4, isJackpot: true },
    ],
    packages: [
      { name: "3 Cards", cardCount: 3, bonusCards: 0, regularPrice: 380, price: 300, sortOrder: 0 },
      { name: "5 Cards", cardCount: 5, bonusCards: 0, regularPrice: 600, price: 480, sortOrder: 1 },
      { name: "10 + 1 Cards", cardCount: 10, bonusCards: 1, regularPrice: 1200, price: 920, sortOrder: 2 },
    ],
  },
];

async function seedCatalog() {
  const results: string[] = [];
  for (const c of CATALOG) {
    let type = await LuckyCardType.findOne({ key: c.key });
    if (!type) {
      type = await LuckyCardType.create({
        key: c.key,
        name: c.name,
        price: c.price,
        accent: c.accent,
        targetRtp: c.targetRtp,
        displayTopPrize: c.displayTopPrize || 0,
        sortOrder: c.sortOrder,
      });
      console.log(`  + created card type: ${c.name}`);
    } else {
      console.log(`  = card type already exists: ${c.name}`);
    }

    const tierCount = await LuckyPrizeTier.countDocuments({ cardType: type._id });
    if (tierCount === 0) {
      await LuckyPrizeTier.insertMany(
        c.tiers.map((t, i) => ({
          cardType: type!._id,
          label: t.label,
          symbol: t.symbol,
          amount: t.amount,
          weight: t.weight,
          stockLimit: (t as any).stockLimit ?? null,
          isJackpot: !!(t as any).isJackpot,
          sortOrder: i,
        })),
      );
      console.log(`    + ${c.tiers.length} prize tiers`);
    }

    const pkgCount = await LuckyPackage.countDocuments({ cardType: type._id });
    if (pkgCount === 0) {
      await LuckyPackage.insertMany(c.packages.map((p) => ({ cardType: type!._id, ...p })));
      console.log(`    + ${c.packages.length} packages`);
    }
    results.push(type.name);
  }
  return results;
}

async function seedPrizePools() {
  const existing = await LuckyPrizePool.countDocuments();
  if (existing > 0) {
    console.log("  = prize pools already exist — skipped");
    return;
  }
  await LuckyPrizePool.insertMany(DEFAULT_POOLS.map((p) => ({ ...p })));
  await LuckyPoolConfig.updateOne(
    { key: "global" },
    { $set: { companyFundPercent: DEFAULT_COMPANY_FUND_PERCENT } },
    { upsert: true },
  );
  console.log("  + seeded 9 prize pools (A–I) + config");
}

async function main() {
  await connectDB();

  console.log("\n🌱 Seeding Lucky Card catalog (Lucky Mini / Star / Gold)...");
  const names = await seedCatalog();

  console.log("\n🌱 Seeding default global prize pool (A–I)...");
  await seedPrizePools();

  console.log(`\n✅ Done. Card types: ${names.join(", ")}`);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("❌ Seed script failed:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
