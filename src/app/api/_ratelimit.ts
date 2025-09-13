// Window: 60s; Max: 10 requests per IP (process memory only)
const WINDOW_MS = 60_000;
const MAX = 10;
type Bucket = { ts: number[] };
const buckets = new Map<string, Bucket>();

export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { ts: [] };
  b.ts = b.ts.filter(t => now - t < WINDOW_MS);
  if (b.ts.length >= MAX) { buckets.set(ip, b); return true; }
  b.ts.push(now); buckets.set(ip, b); return false;
}

export function rateHeaders(ip: string) {
  const b = buckets.get(ip) ?? { ts: [] };
  const remaining = Math.max(0, MAX - b.ts.length);
  return {
    "X-RateLimit-Limit": String(MAX),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Window": `${WINDOW_MS}ms`,
  };
}
