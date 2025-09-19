import { POST as searchPost } from "@/app/api/search/route";

import type { Item } from "@/app/page.client";

const FALLBACK_QUERIES = [
  "latest world news",
  "technology updates",
  "science breakthroughs",
  "finance market news",
  "health discoveries",
  "entertainment highlights",
];

export function getDefaultQueries(): string[] {
  const raw = process.env.BLOOM_DEFAULT_FEED;
  if (typeof raw === "string") {
    const parsed = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return FALLBACK_QUERIES;
}

interface FeedResponse {
  results?: Item[];
  degraded?: boolean;
}

export async function fetchInitialFeed(queries: string[]) {
  const sanitized = queries.map((q) => q.trim()).filter((q) => q.length > 0);
  if (sanitized.length === 0) {
    return { items: [] as Item[], degraded: false };
  }

  try {
    const request = new Request("https://bloom.local/api/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "server-internal",
      },
      body: JSON.stringify({ queries: sanitized }),
    });

    const response = await searchPost(request);
    if (!response.ok) {
      return { items: [] as Item[], degraded: true };
    }

    const data = (await response.json()) as FeedResponse;
    const items = Array.isArray(data?.results) ? data.results : [];
    const degraded =
      data?.degraded === true ||
      items.some(
        (entry) => entry.durationSeconds == null || entry.viewCount == null,
      );
    return { items, degraded };
  } catch {
    return { items: [] as Item[], degraded: true };
  }
}
