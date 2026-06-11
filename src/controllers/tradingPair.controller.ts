import TradingPair from "@/models/TradingPair.model";
import { getIconUrlsForCoinGeckoIds } from "@/services/coinGecko.service";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";

/** ✅ labels => boolean flags mapper */
const toFlags = (labels: string[] = []) => {
  const set = new Set(
    (labels ?? []).map((x) => String(x).toUpperCase().trim())
  );
  const has = (x: string) => set.has(x);

  return {
    isPinned: has("PINNED"),
    isFeatured: has("FEATURED"),
    isMostPopular: has("MOST_POPULAR"),
    isPopular: has("POPULAR"),
    isBestSeller: has("BEST_SELLER"),
    isTrending: has("TRENDING"),
    isNewListing: has("NEW"),
  };
};

type Item = {
  symbol: string;
  coingeckoId: string;

  // optional (Postman থেকে পাঠালে নেবে)
  serialNo?: number;
  baseAsset?: string;
  quoteAsset?: string;
  labels?: string[]; // ✅ ["POPULAR","TRENDING"]
  tags?: string[];
  popularityScore?: number;
  volume24h?: number;
  lastPrice?: number;
};

interface UpsertBody {
  items: Item[];
  force?: boolean; // true হলে iconUrl overwrite করবে
}

/* ────────── POST /trading-pairs/sync-icons ──────────
   body: { items: [{symbol, coingeckoId, serialNo?, labels?, tags?...}], force? }
────────────────────────────────────────────────────── */
export const syncTradingPairIcons: typeHandler = catchAsync(
  async (req, res) => {
    const { items, force = false } = (req.body ?? {}) as UpsertBody;

    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, "items is required");
    }

    // normalize
    const normalized = items
      .map((it) => {
        const symbol = String(it.symbol || "")
          .toUpperCase()
          .trim();
        const coingeckoId = String(it.coingeckoId || "").trim();

        // base/quote fallback
        const baseAsset =
          it.baseAsset?.trim() ||
          (symbol.endsWith("USDT") ? symbol.replace("USDT", "") : symbol);
        const quoteAsset =
          it.quoteAsset?.trim() || (symbol.endsWith("USDT") ? "USDT" : "");

        const serialNo =
          it.serialNo != null && Number.isFinite(Number(it.serialNo))
            ? Number(it.serialNo)
            : undefined;

        const labels = Array.isArray(it.labels) ? it.labels : [];
        const tags = Array.isArray(it.tags) ? it.tags.map(String) : [];

        const popularityScore =
          it.popularityScore != null &&
          Number.isFinite(Number(it.popularityScore))
            ? Number(it.popularityScore)
            : undefined;

        const volume24h =
          it.volume24h != null && Number.isFinite(Number(it.volume24h))
            ? Number(it.volume24h)
            : undefined;

        const lastPrice =
          it.lastPrice != null && Number.isFinite(Number(it.lastPrice))
            ? Number(it.lastPrice)
            : undefined;

        return {
          symbol,
          coingeckoId,
          baseAsset,
          quoteAsset,
          serialNo,
          labels,
          tags,
          popularityScore,
          volume24h,
          lastPrice,
        };
      })
      .filter((it) => it.symbol && it.coingeckoId);

    if (!normalized.length) throw new ApiError(400, "No valid items");

    const symbols = normalized.map((x) => x.symbol);
    const ids = normalized.map((x) => x.coingeckoId);

    // existing iconUrl আছে কিনা (force=false হলে overwrite না করার জন্য)
    const existing = await TradingPair.find(
      { symbol: { $in: symbols } },
      { symbol: 1, iconUrl: 1 }
    ).lean();

    const existingMap = new Map(
      (existing ?? []).map((e: any) => [String(e.symbol).toUpperCase(), e])
    );

    // bulk icon fetch
    const iconById = await getIconUrlsForCoinGeckoIds(ids);

    const ops = normalized.map((it) => {
      const sym = it.symbol;
      const ex = existingMap.get(sym);
      const alreadyHasIcon = !!ex?.iconUrl;

      const setObj: any = {
        coingeckoId: it.coingeckoId,
      };

      // ✅ labels -> flags
      const flags = toFlags(it.labels);
      Object.assign(setObj, flags);

      // optional fields (only set if provided)
      if (it.serialNo !== undefined) setObj.serialNo = it.serialNo;
      if (it.tags?.length) setObj.tags = it.tags;
      if (it.popularityScore !== undefined)
        setObj.popularityScore = it.popularityScore;
      if (it.volume24h !== undefined) setObj.volume24h = it.volume24h;
      if (it.lastPrice !== undefined) setObj.lastPrice = it.lastPrice;

      // iconUrl set
      const iconUrl = iconById[it.coingeckoId];
      if (iconUrl && (force || !alreadyHasIcon)) {
        setObj.iconUrl = iconUrl;
      }

      return {
        updateOne: {
          filter: { symbol: sym },
          update: {
            $set: setObj,
            $setOnInsert: {
              symbol: sym,
              baseAsset: it.baseAsset,
              quoteAsset: it.quoteAsset,
              enabled: true,
              rank: 9999,
            },
          },
          upsert: true,
        },
      };
    });

    const result = await TradingPair.bulkWrite(ops, { ordered: false });

    return res.status(200).json({
      success: true,
      received: items.length,
      processed: normalized.length,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
    });
  }
);

/* ────────── GET /trading-pairs  ──────────
Query params:
  page=1
  limit=50
  search=btc
  enabled=true|false
  popular=true
  mostPopular=true
  bestSeller=true
  trending=true
  newListing=true
  featured=true
  pinned=true
  sort=serialNo|rank|popularityScore|volume24h
  order=asc|desc
────────────────────────────────────────── */
export const getTradingPairs: typeHandler = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Math.min(200, Math.max(1, limitRaw));
  const skip = (page - 1) * limit;

  const search = String(req.query.search ?? "").trim();

  const parseBool = (v: any) => {
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    const s = String(v).toLowerCase();
    if (["true", "1", "yes"].includes(s)) return true;
    if (["false", "0", "no"].includes(s)) return false;
    return undefined;
  };

  const filter: any = {};

  const enabled = parseBool(req.query.enabled);
  if (enabled !== undefined) filter.enabled = enabled;

  const popular = parseBool(req.query.popular);
  if (popular !== undefined) filter.isPopular = popular;

  const mostPopular = parseBool(req.query.mostPopular);
  if (mostPopular !== undefined) filter.isMostPopular = mostPopular;

  const bestSeller = parseBool(req.query.bestSeller);
  if (bestSeller !== undefined) filter.isBestSeller = bestSeller;

  const trending = parseBool(req.query.trending);
  if (trending !== undefined) filter.isTrending = trending;

  const newListing = parseBool(req.query.newListing);
  if (newListing !== undefined) filter.isNewListing = newListing;

  const featured = parseBool(req.query.featured);
  if (featured !== undefined) filter.isFeatured = featured;

  const pinned = parseBool(req.query.pinned);
  if (pinned !== undefined) filter.isPinned = pinned;

  if (search) {
    filter.$or = [
      { symbol: { $regex: search, $options: "i" } },
      { baseAsset: { $regex: search, $options: "i" } },
      { quoteAsset: { $regex: search, $options: "i" } },
      { tags: { $in: [new RegExp(search, "i")] } },
    ];
  }

  const sortKey = String(req.query.sort ?? "serialNo");
  const order =
    String(req.query.order ?? "asc").toLowerCase() === "desc" ? -1 : 1;

  const allowedSort: Record<string, any> = {
    serialNo: { isPinned: -1, serialNo: order },
    rank: { isPinned: -1, rank: order },
    popularityScore: { isPinned: -1, popularityScore: -1, serialNo: 1 },
    volume24h: { isPinned: -1, volume24h: -1, serialNo: 1 },
  };

  const sort = allowedSort[sortKey] ?? allowedSort.serialNo;

  const [items, total] = await Promise.all([
    TradingPair.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    TradingPair.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
    },
    items,
  });
});
