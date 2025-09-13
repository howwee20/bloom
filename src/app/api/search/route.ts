import { ytSearch, ytVideos } from "@/lib/yt";
import { NextResponse } from "next/server";

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
const RESULTS_LIMIT = 20;          // ← new cap
const RECENCY_WEIGHT_BASE = 0.5;   // unchanged for first run
const RECENCY_WEIGHT_FRESH = 0.8;  // stronger recency on respin
const CHANNEL_PENALTY_BASE = 0.2;  // unchanged for first run
const CHANNEL_PENALTY_FRESH = 0.35;// stronger diversity on respin

export async function POST(req: Request) {
  try {
    const {
      queries,
      excludeIds = [],
      seed,
      fresh = false,
    } = await req.json();

    const qArr: string[] = Array.isArray(queries) ? queries : [];
    if (!qArr.length) throw new Error("invalid");

    const excludeIdsArr: string[] = Array.isArray(excludeIds)
      ? excludeIds.filter((s: any) => typeof s === "string")
      : [];

    const seedNum: number | undefined =
      typeof seed === "number" ? seed : undefined;

    const recencyWeight = fresh ? RECENCY_WEIGHT_FRESH : RECENCY_WEIGHT_BASE;
    const channelPenalty = fresh
      ? CHANNEL_PENALTY_FRESH
      : CHANNEL_PENALTY_BASE;

    const exclude = new Set(excludeIdsArr);

    const key = JSON.stringify(qArr);
    const now = Date.now();
    if (!excludeIdsArr.length && seedNum === undefined) {
      const cached = cache.get(key);
      if (cached && now - cached.ts < TTL) {
        return NextResponse.json({ results: cached.data });
      }
    }

    const searchLists = await Promise.all(qArr.map((q) => ytSearch(q, 15)));
    const infoMap = new Map<string, Result>();
    for (const list of searchLists) {
      for (const item of list) {
        if (infoMap.size >= 60) break;
        if (exclude.has(item.videoId)) continue;
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

    const results = Array.from(infoMap.values());
    const scored = results
      .filter((r) => !exclude.has(r.videoId))
      .map((r) => {
        const ageDays =
          (now - new Date(r.publishedAt).getTime()) / 86_400_000;
        let base =
          Math.log10(r.viewCount + 1) +
          Math.exp(-ageDays / 60) * recencyWeight +
          (r.durationSeconds >= 600 ? 0.2 : 0);
        // channel de-dup
        return { r, base };
      });

    const channelCounts = new Map<string, number>();
    const withPenalty = scored.map(({ r, base }) => {
      const count = channelCounts.get(r.channelTitle) ?? 0;
      const j =
        typeof seedNum === "number"
          ? ((seedNum * 31 + r.videoId.length) % 2000) / 10000 - 0.1
          : 0;
      const score = base - channelPenalty * count + j;
      channelCounts.set(r.channelTitle, count + 1);
      return { r, score };
    });

    withPenalty.sort((a, b) => b.score - a.score);
    const top = withPenalty.slice(0, RESULTS_LIMIT).map(({ r }) => r);

    if (!excludeIdsArr.length && seedNum === undefined) {
      cache.set(key, { ts: now, data: top });
    }

    return NextResponse.json({ results: top });
  } catch {
    return NextResponse.json({ results: [] });
  }
}

