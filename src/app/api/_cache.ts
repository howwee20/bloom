export interface Result {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
}

const TTL = 24 * 60 * 60 * 1000; // 24h
const MAX_KEYS = 5000;

const cache = new Map<string, { ts: number; data: Result[] }>();

export function cacheGet(key: string): Result[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TTL) {
    cache.delete(key);
    return undefined;
  }
  // refresh for LRU
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

export function cacheSet(key: string, data: Result[]): void {
  cache.set(key, { ts: Date.now(), data });
  if (cache.size > MAX_KEYS) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}
