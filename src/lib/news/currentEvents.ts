import {
  NEWS_CHANNEL_IDS,
  NEWS_MAX_AGE_HOURS,
  NEWS_TARGET_COUNT,
} from "./sources";

const YT_API = "https://www.googleapis.com/youtube/v3";
const FIELDS =
  "items(id/videoId,snippet(title,channelTitle,thumbnails/high/url,publishedAt))";

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

export type CurrentEvent = {
  id: string;
  title: string;
  byline: string;
  url: string;
  image?: string | null;
  publishedAt: string;
};

async function fetchChannelLatest(
  channelId: string,
  key: string,
): Promise<RawItem[]> {
  const u = new URL(`${YT_API}/search`);
  u.searchParams.set("key", key);
  u.searchParams.set("channelId", channelId);
  u.searchParams.set("order", "date");
  u.searchParams.set("type", "video");
  u.searchParams.set("maxResults", "5");
  u.searchParams.set("publishedAfter", isoSince(NEWS_MAX_AGE_HOURS));
  u.searchParams.set("part", "snippet");
  u.searchParams.set("fields", FIELDS);
  const r = await fetch(u.toString(), { next: { revalidate: 300 } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  return Array.isArray((j as any).items) ? ((j as any).items as RawItem[]) : [];
}

export async function getCurrentEvents(): Promise<CurrentEvent[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const batches = await Promise.all(
    NEWS_CHANNEL_IDS.map((id) => fetchChannelLatest(id, key)),
  );
  const flat: RawItem[] = batches.flat();

  const events: CurrentEvent[] = flat
    .map((it) => {
      const v = it?.id?.videoId;
      const s = it?.snippet;
      const p = s?.publishedAt ?? "";
      if (!v || !s?.title || !s?.channelTitle || !p) return null;
      return {
        id: v,
        title: s.title,
        byline: s.channelTitle,
        publishedAt: p,
        url: `https://www.youtube.com/watch?v=${v}`,
        image: s.thumbnails?.high?.url ?? null,
      } satisfies CurrentEvent;
    })
    .filter(Boolean) as CurrentEvent[];

  const cutoff = Date.now() - NEWS_MAX_AGE_HOURS * 3600_000;
  const seen = new Set<string>();
  const fresh = events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    const ts = new Date(e.publishedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    return ts >= cutoff;
  });

  fresh.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  return fresh.slice(0, NEWS_TARGET_COUNT);
}
