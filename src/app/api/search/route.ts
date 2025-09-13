import { pseSearch } from "@/lib/pse";
import { ytVideos } from "@/lib/yt";

export const runtime = "edge";

interface Result {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
}

const cache = new Map<string, { ts: number; data: Result[] }>();
const TTL = 120_000;
const RESULTS_LIMIT = 8;

function jitter(id: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
  }
  return ((h >>> 0) % 2000) / 10000 - 0.1;
}

function ingest(
  raw: any,
  infoMap: Map<string, Result>,
  excludeSet: Set<string>,
) {
  if (!raw || !Array.isArray(raw.items)) return;
  for (const item of raw.items) {
    const link: string | undefined = item?.link;
    if (typeof link !== "string") continue;
    let id = "";
    try {
      const u = new URL(link);
      if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
        id = u.searchParams.get("v") || "";
      }
    } catch {}
    if (!id || excludeSet.has(id) || infoMap.has(id)) continue;
    const pagemap = item.pagemap || {};
    const title: string = item.title || "";
    const channelTitle: string =
      pagemap.person?.[0]?.name || pagemap.videoobject?.[0]?.author || "";
    const thumbnailUrl: string =
      pagemap.cse_thumbnail?.[0]?.src ||
      pagemap.videoobject?.[0]?.thumbnailurl ||
      pagemap.metatags?.[0]?.["og:image"] ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const publishedAt: string =
      pagemap.videoobject?.[0]?.uploaddate ||
      pagemap.metatags?.[0]?.["og:video:release_date"] ||
      "";
    infoMap.set(id, {
      videoId: id,
      title,
      channelTitle,
      thumbnailUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
      publishedAt,
      durationSeconds: 0,
      viewCount: 0,
    });
    if (infoMap.size >= 20) break;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const queries: string[] = Array.isArray(body?.queries) ? body.queries : [];
    const q = queries[0];
    if (!q) throw new Error("invalid");

    const excludeIds: string[] = Array.isArray(body?.excludeIds)
      ? body.excludeIds.filter((s: any) => typeof s === "string")
      : [];
    const seed: number | undefined =
      typeof body?.seed === "number" ? body.seed : undefined;
    const excludeSet = new Set(excludeIds);

    const key = q;
    const now = Date.now();
    if (!excludeIds.length && seed === undefined) {
      const cached = cache.get(key);
      if (cached && now - cached.ts < TTL) {
        return new Response(
          JSON.stringify({ results: cached.data, degraded: false }),
          { headers: { "content-type": "application/json" } },
        );
      }
    }

    const infoMap = new Map<string, Result>();
    const first = await pseSearch(q, 10, 1);
    ingest(first.raw, infoMap, excludeSet);
    if (infoMap.size < RESULTS_LIMIT) {
      const second = await pseSearch(q, 10, 11);
      ingest(second.raw, infoMap, excludeSet);
    }

    const ids = Array.from(infoMap.keys());
    if (!ids.length) {
      return new Response(JSON.stringify({ results: [], degraded: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    const baseScores = ids.map((id) => {
      const v = infoMap.get(id)!;
      const publishedMs = Date.parse(v.publishedAt);
      const ageDays = isNaN(publishedMs)
        ? 3650
        : (now - publishedMs) / 86_400_000;
      const base = -ageDays;
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

    let degraded = false;
    const shouldHydrate = process.env.ENABLE_YT_HYDRATE !== "0";
    if (shouldHydrate) {
      const stats = await ytVideos(top.map((v) => v.videoId));
      if (stats.length === top.length) {
        const statMap = new Map(stats.map((s) => [s.videoId, s]));
        for (const v of top) {
          const s = statMap.get(v.videoId);
          if (s) {
            v.durationSeconds = s.durationSeconds;
            v.viewCount = s.viewCount;
          }
        }
      } else {
        degraded = true;
      }
    } else {
      degraded = true;
    }

    if (!excludeIds.length && seed === undefined && !degraded) {
      cache.set(key, { ts: now, data: top });
    }

    return new Response(JSON.stringify({ results: top, degraded }), {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ results: [], degraded: true }), {
      headers: { "content-type": "application/json" },
    });
  }
}
