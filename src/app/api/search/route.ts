import { ytSearch, ytVideos } from "@/lib/yt";
import { cacheGet, cacheSet, Result } from "../_cache";
import { rateLimit } from "../_ratelimit";

export const runtime = "edge";

const RESULTS_LIMIT = 8;

function jitter(id: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
  }
  return ((h >>> 0) % 2000) / 10000 - 0.1;
}

export async function POST(req: Request) {
  try {
    const id =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for") ||
      "";
    if (rateLimit(id)) {
      return new Response(JSON.stringify({ rateLimited: true, results: [] }), {
        headers: { "content-type": "application/json" },
        status: 429,
      });
    }

    const body = await req.json();
    const queries: string[] = Array.isArray(body?.queries) ? body.queries : [];
    if (!queries.length) throw new Error("invalid");

    const excludeIds: string[] = Array.isArray(body?.excludeIds)
      ? body.excludeIds.filter((s: any) => typeof s === "string")
      : [];
    const seed: number | undefined =
      typeof body?.seed === "number" ? body.seed : undefined;
    const excludeSet = new Set(excludeIds);

    const key = JSON.stringify(queries);
    const now = Date.now();
    if (!excludeIds.length && seed === undefined) {
      const cached = cacheGet(key);
      if (cached) {
        return new Response(JSON.stringify({ results: cached }), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    const searchLists = await Promise.all(queries.map((q) => ytSearch(q, 15)));
    const infoMap = new Map<string, Result>();
    for (const list of searchLists) {
      for (const item of list) {
        if (infoMap.size >= 60) break;
        if (excludeSet.has(item.videoId)) continue;
        if (!infoMap.has(item.videoId)) {
          infoMap.set(item.videoId, {
            videoId: item.videoId,
            title: item.title,
            channelTitle: item.channelTitle,
            thumbnailUrl: item.thumbnailUrl,
            youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
            publishedAt: item.publishedAt,
            durationSeconds: 0,
            viewCount: 0,
          });
        }
      }
      if (infoMap.size >= 60) break;
    }

    const ids = Array.from(infoMap.keys());
    const stats = await ytVideos(ids);
    for (const s of stats) {
      const item = infoMap.get(s.videoId);
      if (item) {
        item.durationSeconds = s.durationSeconds;
        item.viewCount = s.viewCount;
      }
    }

    const baseScores = ids.map((id) => {
      const v = infoMap.get(id)!;
      const publishedMs = Date.parse(v.publishedAt);
      const ageDays = isNaN(publishedMs)
        ? 0
        : (now - publishedMs) / 86_400_000;
      const base =
        Math.log10(v.viewCount + 1) +
        Math.exp(-ageDays / 60) * 0.5 +
        (v.durationSeconds >= 600 ? 0.2 : 0);
      return { v, base };
    });

    baseScores.sort((a, b) => b.base - a.base);

    const channelCounts = new Map<string, number>();
    const scored: { v: Result; score: number }[] = [];
    for (const { v, base } of baseScores) {
      const count = channelCounts.get(v.channelTitle) ?? 0;
      const jitterVal = seed === undefined ? 0 : jitter(v.videoId, seed);
      const score = base - 0.2 * count + jitterVal;
      channelCounts.set(v.channelTitle, count + 1);
      scored.push({ v, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, RESULTS_LIMIT).map((s) => s.v);

    if (!excludeIds.length && seed === undefined) {
      cacheSet(key, top);
    }

    return new Response(JSON.stringify({ results: top }), {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { "content-type": "application/json" },
    });
  }
}

