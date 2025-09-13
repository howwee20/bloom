export type CounterName =
  | "pse_requests"
  | "yt_hydrate_requests"
  | "yt_hydrate_quota_exceeded";

interface CounterBucket {
  timestamps: number[];
}

interface CounterStore {
  [key: string]: CounterBucket;
}

const store: CounterStore = (globalThis as any).__bloomCounters || {
  pse_requests: { timestamps: [] },
  yt_hydrate_requests: { timestamps: [] },
  yt_hydrate_quota_exceeded: { timestamps: [] },
};
(globalThis as any).__bloomCounters = store;

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

export function logCounter(name: CounterName) {
  const now = Date.now();
  const bucket = store[name];
  if (!bucket) return;
  bucket.timestamps.push(now);
  // Trim entries older than a day to keep memory bounded
  const cutoff = now - ONE_DAY;
  while (bucket.timestamps.length && bucket.timestamps[0] < cutoff) {
    bucket.timestamps.shift();
  }
}

export function getRollingCounts() {
  const now = Date.now();
  const minuteAgo = now - ONE_MINUTE;
  const hourAgo = now - ONE_HOUR;

  const result: Record<CounterName, {
    last_minute: number;
    last_hour: number;
    last_day: number;
  }> = {
    pse_requests: { last_minute: 0, last_hour: 0, last_day: 0 },
    yt_hydrate_requests: { last_minute: 0, last_hour: 0, last_day: 0 },
    yt_hydrate_quota_exceeded: { last_minute: 0, last_hour: 0, last_day: 0 },
  };

  (Object.keys(store) as CounterName[]).forEach((name) => {
    const arr = store[name].timestamps;
    let m = 0;
    let h = 0;
    for (const ts of arr) {
      if (ts >= minuteAgo) m++;
      if (ts >= hourAgo) h++;
    }
    result[name] = { last_minute: m, last_hour: h, last_day: arr.length };
  });

  return result;
}
