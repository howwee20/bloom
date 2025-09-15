import type { YTComment } from "./types";

const YT_API = "https://www.googleapis.com/youtube/v3";
const MAX_RESULTS_PER_VIDEO = 20;
const MAX_ALLOWED = 10;

function buildCommentsURL(videoId: string, key: string) {
  const u = new URL(`${YT_API}/commentThreads`);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("videoId", videoId);
  u.searchParams.set("maxResults", String(MAX_RESULTS_PER_VIDEO));
  u.searchParams.set("order", "relevance");
  u.searchParams.set("textFormat", "plainText");
  u.searchParams.set("key", key);
  return u.toString();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasVisibleCharacters(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return trimmed.replace(/\s+/g, "").length >= 8;
}

function computeRecencyBoost(publishedAt?: string): number {
  if (!publishedAt) return 0;
  const ts = Date.parse(publishedAt);
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  if (ageMs <= 0) return 0.5;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const maxDays = 365;
  const clampedRatio = Math.min(Math.max(ageDays / maxDays, 0), 1);
  return 0.5 * (1 - clampedRatio);
}

export async function fetchTopCommentsForId(
  videoId: string,
  max = 8,
): Promise<YTComment[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const limit = Math.min(MAX_ALLOWED, Math.max(1, Math.floor(max)));
  const url = buildCommentsURL(videoId, key);

  const response = await fetch(url, { next: { revalidate: 86400 } });
  if (!response.ok) return [];

  const json = await response.json();
  const items: any[] = Array.isArray(json?.items) ? json.items : [];

  const ranked = items
    .map((item) => {
      const snippet = item?.snippet?.topLevelComment?.snippet;
      if (!snippet) return null;
      const text = normalizeText((snippet?.textDisplay ?? "").toString());
      if (!hasVisibleCharacters(text)) return null;
      const likes =
        typeof snippet?.likeCount === "number" && Number.isFinite(snippet.likeCount)
          ? snippet.likeCount
          : undefined;
      const replies =
        typeof item?.snippet?.totalReplyCount === "number" &&
        Number.isFinite(item.snippet.totalReplyCount)
          ? item.snippet.totalReplyCount
          : undefined;
      const publishedAt = typeof snippet?.publishedAt === "string" ? snippet.publishedAt : undefined;
      const likeScore = likes ?? 0;
      const replyScore = replies ? replies * 0.5 : 0;
      const recencyBoost = computeRecencyBoost(publishedAt);
      const score = likeScore + replyScore + recencyBoost;
      const base: YTComment = {
        id: (item?.id ?? "").toString(),
        author: (snippet?.authorDisplayName ?? "Unknown").toString(),
        text,
      };
      return {
        ...base,
        likes,
        replies,
        publishedAt,
        score,
      } satisfies YTComment;
    })
    .filter((c): c is YTComment => c != null)
    .sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      if (a.publishedAt && b.publishedAt) {
        return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      }
      return 0;
    });

  return ranked.slice(0, limit);
}

type BatchOptions = {
  max?: number;
  concurrency?: number;
};

export async function fetchTopCommentsBatch(
  ids: string[],
  options: BatchOptions = {},
): Promise<Record<string, YTComment[]>> {
  const unique = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
  const limit = Math.min(MAX_ALLOWED, Math.max(1, Math.floor(options.max ?? 8)));
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3));
  const out: Record<string, YTComment[]> = {};
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const index = cursor++;
      const id = unique[index];
      try {
        const comments = await Promise.race<YTComment[]>([
          fetchTopCommentsForId(id, limit),
          new Promise<YTComment[]>((resolve) => setTimeout(() => resolve([]), 1000)),
        ]);
        out[id] = comments;
      } catch {
        out[id] = [];
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()),
  );

  return out;
}
