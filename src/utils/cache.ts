type Entry<T> = { data: T; exp: number };
const store = new Map<string, Entry<any>>();

export function getCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    store.delete(key);
    return null;
  }
  return hit.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number) {
  store.set(key, { data, exp: Date.now() + ttlMs });
}
