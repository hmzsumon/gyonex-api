// src/services/syncTradingPairs.service.ts
import TradingPair from "@/models/TradingPair.model";
import axios from "axios";
import fs from "fs";
import path from "path";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

/**
 * ✅ Static map: Binance symbol -> CoinGecko coin id
 * Note: object এ duplicate key থাকলে শেষেরটাই থাকবে (JS behavior)
 */
const BINANCE_TO_COINGECKO: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  BNBUSDT: "binancecoin",
  SOLUSDT: "solana",
  XRPUSDT: "ripple",
  ADAUSDT: "cardano",
  DOGEUSDT: "dogecoin",
  TRXUSDT: "tron",
  DOTUSDT: "polkadot",
  MATICUSDT: "polygon",
  LINKUSDT: "chainlink",
  LTCUSDT: "litecoin",
  BCHUSDT: "bitcoin-cash",
  AVAXUSDT: "avalanche-2",
  ATOMUSDT: "cosmos",
  ETCUSDT: "ethereum-classic",
  XLMUSDT: "stellar",
  ICPUSDT: "internet-computer",
  NEARUSDT: "near",
  FILUSDT: "filecoin",

  OPUSDT: "optimism",
  ARBUSDT: "arbitrum",
  INJUSDT: "injective",
  APTUSDT: "aptos",
  SUIUSDT: "sui",
  AAVEUSDT: "aave",
  ALGOUSDT: "algorand",
  ANKRUSDT: "ankr",
  HBARUSDT: "hedera",
  UNIUSDT: "uniswap",

  SHIBUSDT: "shiba-inu",
  PEPEUSDT: "pepe",
  FLOKIUSDT: "floki",
  BONKUSDT: "bonk",
  WIFUSDT: "dogwifhat",
  FETUSDT: "fetch-ai",
  RNDRUSDT: "render-token",
  CHZUSDT: "chiliz",
  WLDUSDT: "worldcoin",
  PAXGUSDT: "pax-gold",

  ZECUSDT: "zcash",
  TONUSDT: "toncoin",
  TIAUSDT: "celestia",
  SEIUSDT: "sei-network",
  JUPUSDT: "jupiter-exchange-solana",
  PYTHUSDT: "pyth-network",
  ARKUSDT: "ark",
  EGLDUSDT: "elrond-erd-2",
  SANDUSDT: "the-sandbox",
  MANAUSDT: "decentraland",

  GALAUSDT: "gala",
  AXSUSDT: "axie-infinity",
  IMXUSDT: "immutable-x",
  FLOWUSDT: "flow",
  KAVAUSDT: "kava",
  RUNEUSDT: "thorchain",
  MINAUSDT: "mina-protocol",
  CRVUSDT: "curve-dao-token",
  LDOUSDT: "lido-dao",
  MKRUSDT: "maker",

  COMPUSDT: "compound-governance-token",
  SNXUSDT: "havven",
  YFIUSDT: "yearn-finance",
  BALUSDT: "balancer",
  ENJUSDT: "enjincoin",
  BATUSDT: "basic-attention-token",
  ZILUSDT: "zilliqa",
  ONEUSDT: "harmony",
  ICXUSDT: "icon",
  QTUMUSDT: "qtum",

  KSMUSDT: "kusama",
  ROSEUSDT: "oasis-network",
  CELOUSDT: "celo",
  DASHUSDT: "dash",
  WAVESUSDT: "waves",
  IOTAUSDT: "iota",
  NEOUSDT: "neo",
  ONTUSDT: "ontology",
  ZRXUSDT: "0x",
  SKLUSDT: "skale",
  LRCUSDT: "loopring",
  OCEANUSDT: "ocean-protocol",
  COTIUSDT: "coti",
  CTSIUSDT: "cartesi",
  BANDUSDT: "band-protocol",
  STORJUSDT: "storj",
  KNCUSDT: "kyber-network-crystal",
  OMGUSDT: "omisego",
  RENUSDT: "republic-protocol",
  ANTUSDT: "aragon",

  ARDRUSDT: "ardor",
  IOSTUSDT: "iostoken",
  SCUSDT: "siacoin",
  DGBUSDT: "digibyte",
  HIVEUSDT: "hive",
  XEMUSDT: "nem",
  STRAXUSDT: "stratis",
  RLCUSDT: "iexec-rlc",
  SUSHIUSDT: "sushi",
  CVCUSDT: "civic",

  STMXUSDT: "storm",
  NKNUSDT: "nkn",
  API3USDT: "api3",
  ALPHAUSDT: "alpha-finance",
  PERPUSDT: "perpetual-protocol",
  LITUSDT: "litentry",
  DODOUSDT: "dodo",
  BAKEUSDT: "bakerytoken",
  TLMUSDT: "alien-worlds",
  BELUSDT: "bella-protocol",

  FLMUSDT: "flamingo-finance",
  SRMUSDT: "serum",
  RAYUSDT: "raydium",
  AUDIOUSDT: "audius",
  AKROUSDT: "akropolis",
  FRONTUSDT: "frontier-token",
  HARDUSDT: "kava-lend",
  KP3RUSDT: "keep3rv1",
  NMRUSDT: "numeraire",
  OGNUSDT: "origin-protocol",

  REEFUSDT: "reef-finance",
  SFPUSDT: "safepal",
  XVSUSDT: "venus",
  PONDUSDT: "marlin",
  UNFIUSDT: "unifi-protocol-dao",
  CVPUSDT: "powerpool",
  FORTHUSDT: "ampleforth-governance-token",
  GRTUSDT: "the-graph",
  LINAUSDT: "linear",
  MBLUSDT: "moviebloc",

  PERLUSDT: "perlin",
  DENTUSDT: "dent",
  HOTUSDT: "holotoken",
  WINUSDT: "wink",
  KEYUSDT: "selfkey",
  VETUSDT: "vechain",
  THETAUSDT: "theta-token",
  TFUELUSDT: "theta-fuel",
  RVNUSDT: "ravencoin",
  CELRUSDT: "celer-network",

  STPTUSDT: "standard-tokenization-protocol",
  TROYUSDT: "troy",
  FIOUSDT: "fio-protocol",
  COSUSDT: "contentos",
  TOMOUSDT: "tomochain",
  CKBUSDT: "nervos-network",
  IRISUSDT: "iris-network",
  VITEUSDT: "vite",
  DOCKUSDT: "dock",
  NULSUSDT: "nuls",

  ILVUSDT: "illuvium",
  APEUSDT: "apecoin",
  GMTUSDT: "stepn",
  GSTUSDT: "green-satoshi-token",
  DYDXUSDT: "dydx",

  FXSUSDT: "frax-share",
  FRAXUSDT: "frax",
  CVXUSDT: "convex-finance",
  SPELLUSDT: "spell-token",
  ACHUSDT: "alchemy-pay",
  IDUSDT: "space-id",

  GMXUSDT: "gmx",
  MAGICUSDT: "magic",
  JOEUSDT: "joe",

  SSVUSDT: "ssv-network",
  RPLUSDT: "rocket-pool",

  CSPRUSDT: "casper-network",
  LQTYUSDT: "liquity",
  ENSUSDT: "ethereum-name-service",
  MASKUSDT: "mask-network",
  C98USDT: "coin98",
  TRUUSDT: "truefi",

  MCUSDT: "merit-circle",
  TWTUSDT: "trust-wallet-token",
  XNOUSDT: "nano",
  KLAYUSDT: "klay-token",

  GLMRUSDT: "moonbeam",
  MOVRUSDT: "moonriver",
  ASTRUSDT: "astar",
  CFGUSDT: "centrifuge",

  AGLDUSDT: "adventure-gold",
  DARUSDT: "mines-of-dalarnia",
  ALPACAUSDT: "alpaca-finance",
  DEGOUSDT: "dego-finance",
  USTCUSDT: "terrausd",
  LUNCUSDT: "terra-luna",
  HFTUSDT: "hashflow",
  BLURUSDT: "blur",
  EDUUSDT: "open-campus",
};

type ValidateSyncOptions = {
  quoteAsset?: string; // default "USDT"
  disableOthers?: boolean; // default true (only when recreate=false)
  writeValidatedFile?: boolean; // default false
  recreate?: boolean; // ✅ true হলে quoteAsset scope এ আগে delete করে fresh create
};

export type ValidateSyncResult = {
  quoteAsset: string;
  totalInList: number;
  usedPairs: number;
  validPairs: number;
  invalidPairs: number;
  invalid: Array<{ symbol: string; coingeckoId: string }>;

  upserted: number; // recreate হলে inserted count
  modified: number;
  matched: number;
  disabled: number;

  validatedFile?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getHeaders() {
  const headers: Record<string, string> = {};
  // Demo key থাকলে rate-limit কম ঝামেলা হবে
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }
  return headers;
}

// ✅ 429 হলে backoff + retry
async function cgGet<T = any>(url: string, params: Record<string, any>) {
  const headers = getHeaders();
  const maxRetries = 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get<T>(url, { headers, params, timeout: 20_000 });
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 429 || (status >= 500 && status <= 599)) {
        const ra = err?.response?.headers?.["retry-after"];
        const retryAfterSec = ra ? Number(ra) : NaN;

        const waitMs = Number.isFinite(retryAfterSec)
          ? retryAfterSec * 1000
          : Math.min(30_000, 800 * Math.pow(2, attempt));

        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }

  throw new Error("CoinGecko rate limit exceeded. Please retry later.");
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseBaseQuote(symbol: string, quoteAsset: string) {
  const s = symbol.toUpperCase();
  if (!s.endsWith(quoteAsset)) return null;
  const base = s.slice(0, s.length - quoteAsset.length);
  if (!base) return null;
  return { baseAsset: base, quoteAsset };
}

// ✅ static list -> validate by /coins/markets -> get iconUrl
async function validateStaticMapAndFetchIcons(quoteAsset: string) {
  const entries = Object.entries(BINANCE_TO_COINGECKO).map(([s, id]) => ({
    symbol: s.toUpperCase(),
    coingeckoId: String(id),
  }));

  const used = entries
    .map((e) => {
      const p = parseBaseQuote(e.symbol, quoteAsset);
      if (!p) return null;
      return {
        symbol: e.symbol,
        baseAsset: p.baseAsset,
        quoteAsset: p.quoteAsset,
        coingeckoId: e.coingeckoId,
      };
    })
    .filter(Boolean) as Array<{
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    coingeckoId: string;
  }>;

  const uniqueIds = [
    ...new Set(used.map((x) => x.coingeckoId).filter(Boolean)),
  ];

  // ✅ validate + image in one call (chunked)
  const idToImage = new Map<string, string>();

  for (const idsChunk of chunk(uniqueIds, 150)) {
    const res = await cgGet(`${COINGECKO_BASE}/coins/markets`, {
      vs_currency: "usd",
      ids: idsChunk.join(","),
      per_page: idsChunk.length,
      page: 1,
      sparkline: false,
    });

    for (const item of (res.data as any[]) ?? []) {
      const id = String(item?.id ?? "");
      const image = String(item?.image ?? "");
      if (id && image) idToImage.set(id, image);
    }

    await sleep(150);
  }

  const valid = used
    .map((x) => ({
      ...x,
      iconUrl: idToImage.get(x.coingeckoId),
    }))
    .filter((x) => Boolean(x.iconUrl)) as Array<{
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    coingeckoId: string;
    iconUrl: string;
  }>;

  const invalid = used
    .filter((x) => !idToImage.get(x.coingeckoId))
    .map((x) => ({ symbol: x.symbol, coingeckoId: x.coingeckoId }));

  const validMap: Record<string, string> = {};
  for (const v of valid) validMap[v.symbol] = v.coingeckoId;

  return { entries, used, valid, invalid, validMap };
}

function writeValidatedTsFile(validMap: Record<string, string>) {
  const OUT_FILE = path.join(
    process.cwd(),
    "src/services/binanceToCoingecko.validated.ts"
  );

  const keys = Object.keys(validMap).sort((a, b) => a.localeCompare(b));
  const lines = keys.map(
    (k) => `  ${JSON.stringify(k)}: ${JSON.stringify(validMap[k])},`
  );

  const content = `// ⚠️ AUTO-GENERATED (validated against CoinGecko /coins/markets)
// Do not edit manually.
export const BINANCE_TO_COINGECKO_VALIDATED: Record<string, string> = {
${lines.join("\n")}
};
`;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, content, "utf8");

  return OUT_FILE;
}

/**
 * ✅ MAIN: validate + icon fetch + DB write
 * - recreate=true  => deleteMany({quoteAsset}) + insertMany(valid)
 * - recreate=false => bulkWrite upsert
 */
export async function syncTradingPairsFromStaticListWithIcons(
  opts: ValidateSyncOptions = {}
): Promise<ValidateSyncResult> {
  const quoteAsset = String(opts.quoteAsset ?? "USDT").toUpperCase();
  const recreate = opts.recreate ?? false;
  const disableOthers = opts.disableOthers ?? true;
  const writeValidatedFile = opts.writeValidatedFile ?? false;

  const { entries, used, valid, invalid, validMap } =
    await validateStaticMapAndFetchIcons(quoteAsset);

  let validatedFile: string | undefined;
  if (writeValidatedFile) {
    validatedFile = writeValidatedTsFile(validMap);
  }

  // ✅ recreate mode: delete + fresh insert
  if (recreate) {
    await TradingPair.deleteMany({ quoteAsset });
  }

  let upserted = 0;
  let modified = 0;
  let matched = 0;

  if (recreate) {
    if (valid.length > 0) {
      const docs = valid.map((p, idx) => ({
        symbol: p.symbol,
        baseAsset: p.baseAsset,
        quoteAsset: p.quoteAsset,
        enabled: true,
        rank: idx + 1,
        coingeckoId: p.coingeckoId,
        iconUrl: p.iconUrl,
      }));

      const inserted = await TradingPair.insertMany(docs, { ordered: false });
      upserted = inserted.length; // created count
    }
  } else {
    // ✅ upsert mode
    const ops = valid.map((p, idx) => ({
      updateOne: {
        filter: { symbol: p.symbol },
        update: {
          $set: {
            symbol: p.symbol,
            baseAsset: p.baseAsset,
            quoteAsset: p.quoteAsset,
            enabled: true,
            rank: idx + 1,
            coingeckoId: p.coingeckoId,
            iconUrl: p.iconUrl,
          },
        },
        upsert: true,
      },
    }));

    const bulkRes =
      ops.length > 0
        ? await TradingPair.bulkWrite(ops, { ordered: false })
        : null;

    upserted = bulkRes?.upsertedCount ?? 0;
    modified = bulkRes?.modifiedCount ?? 0;
    matched = bulkRes?.matchedCount ?? 0;
  }

  // ✅ disable others only when NOT recreate (recreate already deleted)
  let disabled = 0;
  if (!recreate && disableOthers) {
    const validSymbols = valid.map((x) => x.symbol);
    const r = await TradingPair.updateMany(
      { quoteAsset, symbol: { $nin: validSymbols } },
      { $set: { enabled: false, rank: 9999 } }
    );
    disabled = r.modifiedCount ?? 0;
  }

  return {
    quoteAsset,
    totalInList: entries.length,
    usedPairs: used.length,
    validPairs: valid.length,
    invalidPairs: invalid.length,
    invalid,
    upserted,
    modified,
    matched,
    disabled,
    ...(validatedFile ? { validatedFile } : {}),
  };
}
