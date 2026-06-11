import { Document, Schema, model } from "mongoose";

export interface ITradingPair extends Document {
  serialNo: number; // ✅ unique serial number (একই serial ২বার হবে না)
  symbol: string; // BTCUSDT
  baseAsset: string; // BTC
  quoteAsset: string; // USDT
  enabled: boolean;
  rank: number; // internal ranking

  // CoinGecko
  coingeckoId?: string; // bitcoin
  iconUrl?: string; // cached icon url

  // Binance-like UI flags (global)
  isFeatured: boolean; // Featured/Highlighted
  isPopular: boolean; // Popular
  isMostPopular: boolean; // Most Popular
  isBestSeller: boolean; // Best Seller
  isTrending: boolean; // Trending / Hot
  isNewListing: boolean; // New
  isPinned: boolean; // Top/pinned in list

  // extra useful fields
  tags: string[]; // ["meme","defi","layer2"] etc
  popularityScore: number; // sorting helper (0..100 বা যেভাবে চাও)
  volume24h?: number; // optional: UI sorting / analytics
  lastPrice?: number; // optional: cache

  createdAt: Date;
  updatedAt: Date;
}

const tradingPairSchema = new Schema<ITradingPair>(
  {
    // ✅ unique serial
    serialNo: { type: Number, required: true, unique: true, index: true },

    symbol: { type: String, required: true, unique: true, index: true },
    baseAsset: { type: String, required: true, index: true },
    quoteAsset: { type: String, required: true, index: true },
    enabled: { type: Boolean, default: true, index: true },
    rank: { type: Number, default: 9999, index: true },

    coingeckoId: { type: String, index: true },
    iconUrl: { type: String },

    // Binance-like UI flags
    isFeatured: { type: Boolean, default: false, index: false },
    isPopular: { type: Boolean, default: false, index: false },
    isMostPopular: { type: Boolean, default: false, index: false },
    isBestSeller: { type: Boolean, default: false, index: false },
    isTrending: { type: Boolean, default: false, index: false },
    isNewListing: { type: Boolean, default: false, index: false },
    isPinned: { type: Boolean, default: false, index: false },

    tags: { type: [String], default: [], index: true },
    popularityScore: { type: Number, default: 0, index: true },
    volume24h: { type: Number, default: 0, index: true },
    lastPrice: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ✅ extra indexes (optional but useful)
tradingPairSchema.index({ enabled: 1, isPinned: 1, serialNo: 1 });
tradingPairSchema.index({ enabled: 1, popularityScore: -1 });
tradingPairSchema.index({ enabled: 1, volume24h: -1 });

const TradingPair = model<ITradingPair>("TradingPair", tradingPairSchema);
export default TradingPair;
