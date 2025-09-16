import {
  MEDIA_CHANNEL_IDS,
  MEDIA_MAX_AGE_HOURS,
  MEDIA_TARGET_COUNT,
} from "./sources";

const YT_API = "https://www.googleapis.com/youtube/v3";
const FIELDS =
  "items(id/videoId,snippet(title,channelTitle,thumbnails/high/url,publishedAt))";
const BACKFILL_QUERY = "Top news";

function isoSince(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

type RawItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string } };
  };
};

export type CurrentMedia = {
  id: string;
  title: string;
  byline: string;
  url: string;
  image?: string | null;
  publishedAt: string;
};

type SearchParams = Record<string, string>;

async function youtubeSearch(
  params: SearchParams,
  key: string,
): Promise<RawItem[]> {
  const u = new URL(`${YT_API}/search`);
  u.searchParams.set("key", key);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("type", "video");
  u.searchParams.set("fields", FIELDS);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), { next: { revalidate: 300 } });
  if (!res.ok) {
    return [];
  }
  const json = await res.json().catch(() => ({}));
  return Array.isArray((json as any).items) ? ((json as any).items as RawItem[]) : [];
}

async function fetchChannelLatest(channelId: string, key: string) {
  return youtubeSearch(
    {
      channelId,
      order: "date",
      maxResults: "5",
      publishedAfter: isoSince(MEDIA_MAX_AGE_HOURS),
    },
    key,
  );
}

async function fetchTopNews(key: string, useCutoff: boolean) {
  const params: SearchParams = {
    q: BACKFILL_QUERY,
    order: "date",
    maxResults: "20",
  };
  if (useCutoff) {
    params.publishedAfter = isoSince(MEDIA_MAX_AGE_HOURS);
  }
  return youtubeSearch(params, key);
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/#?live\b/g, " ")
    .replace(/#?shorts?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapItem(raw: RawItem): CurrentMedia | null {
  const videoId = raw?.id?.videoId;
  const snippet = raw?.snippet;
  const publishedAt = snippet?.publishedAt ?? "";
  if (!videoId || !snippet?.title || !snippet?.channelTitle || !publishedAt) {
    return null;
  }
  const parsed = Date.parse(publishedAt);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return {
    id: videoId,
    title: snippet.title,
    byline: snippet.channelTitle,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    image: snippet.thumbnails?.high?.url ?? null,
    publishedAt,
  } satisfies CurrentMedia;
}

function applyCutoff(items: CurrentMedia[], cutoffMs: number) {
  return items.filter((item) => {
    const ts = Date.parse(item.publishedAt);
    if (!Number.isFinite(ts)) {
      return false;
    }
    return ts >= cutoffMs;
  });
}

function dedupe(items: CurrentMedia[]) {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const result: CurrentMedia[] = [];
  for (const item of items) {
    if (seenIds.has(item.id)) continue;
    const normalized = normalizeTitle(item.title);
    if (normalized && seenTitles.has(normalized)) continue;
    seenIds.add(item.id);
    if (normalized) {
      seenTitles.add(normalized);
    }
    result.push(item);
  }
  return result;
}

export async function getCurrentMedia(): Promise<CurrentMedia[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const cutoffMs = Date.now() - MEDIA_MAX_AGE_HOURS * 3600_000;

  const channelIds = Array.from(new Set(MEDIA_CHANNEL_IDS));
  const channelBatches = await Promise.all(
    channelIds.map((id) => fetchChannelLatest(id, key)),
  );
  const channelItems = channelBatches
    .flat()
    .map(mapItem)
    .filter((item): item is CurrentMedia => Boolean(item));

  const freshChannelItems = applyCutoff(channelItems, cutoffMs);
  freshChannelItems.sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );

  const unique = dedupe(freshChannelItems);

  if (unique.length >= MEDIA_TARGET_COUNT) {
    return unique.slice(0, MEDIA_TARGET_COUNT);
  }

  let combined = [...unique];
  const seenIds = new Set(combined.map((item) => item.id));
  const seenTitles = new Set(
    combined.map((item) => normalizeTitle(item.title)).filter(Boolean),
  );

  async function backfill(useCutoff: boolean) {
    const fallbackItems = (await fetchTopNews(key, useCutoff))
      .map(mapItem)
      .filter((item): item is CurrentMedia => Boolean(item));

    const sorted = fallbackItems.sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );
    for (const item of sorted) {
      if (seenIds.has(item.id)) continue;
      const normalized = normalizeTitle(item.title);
      if (normalized && seenTitles.has(normalized)) continue;
      seenIds.add(item.id);
      if (normalized) {
        seenTitles.add(normalized);
      }
      combined.push(item);
      if (combined.length >= MEDIA_TARGET_COUNT) break;
    }
  }

  await backfill(true);
  if (combined.length < MEDIA_TARGET_COUNT) {
    await backfill(false);
  }

  combined.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  return combined.slice(0, MEDIA_TARGET_COUNT);
}
