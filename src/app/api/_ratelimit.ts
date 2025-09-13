const WINDOW = 60 * 1000; // 60 seconds
const MAX_TOKENS = 10;

interface Bucket {
  tokens: number;
  ts: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { tokens: MAX_TOKENS - 1, ts: now });
    return false;
  }
  if (now - bucket.ts > WINDOW) {
    bucket.tokens = MAX_TOKENS - 1;
    bucket.ts = now;
    return false;
  }
  if (bucket.tokens <= 0) {
    return true;
  }
  bucket.tokens -= 1;
  return false;
}
