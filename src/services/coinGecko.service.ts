import axios, { AxiosError } from "axios";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getWithRetry<T>(
  url: string,
  params: any,
  maxRetry = 5
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      const res = await axios.get(url, { params, timeout: 15000 });
      return res.data as T;
    } catch (err) {
      attempt++;
      const e = err as AxiosError<any>;
      const status = e.response?.status;

      const retryable =
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        e.code === "ECONNABORTED" ||
        e.code === "ETIMEDOUT";

      if (!retryable || attempt > maxRetry) throw err;

      const backoff = Math.min(8000, 500 * Math.pow(2, attempt));
      await sleep(backoff);
    }
  }
}

/**
 * ✅ ids => { id: imageUrl }
 * Free (no key) rate limit এড়াতে chunk + delay
 */
export async function getIconUrlsForCoinGeckoIds(
  ids: string[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const out: Record<string, string> = {};
  const CHUNK = 80;

  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK);

    const data = await getWithRetry<any[]>(`${COINGECKO_BASE}/coins/markets`, {
      vs_currency: "usd",
      ids: chunk.join(","),
      per_page: 250,
      page: 1,
      sparkline: false,
    });

    for (const item of data ?? []) {
      if (item?.id && item?.image) out[item.id] = item.image;
    }

    await sleep(1200); // free plan safe delay
  }

  return out;
}
