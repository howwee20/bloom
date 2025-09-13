import { logCounter } from "@/lib/counters";

export interface VideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export interface VideoStats {
  videoId: string;
  durationSeconds: number;
  viewCount: number;
}

interface SearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; default?: { url?: string } };
  };
}

interface SearchResponse {
  items?: SearchItem[];
}

interface VideoItem {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

interface VideosResponse {
  items?: VideoItem[];
}

interface ChannelItem {
  id?: string;
  snippet?: { title?: string };
}

interface ChannelsResponse {
  items?: ChannelItem[];
}

async function safeFetch(
  url: string,
  init?: RequestInit
): Promise<{ res: Response | null; errorText?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      let text: string | undefined;
      // Minimal diagnostics: surface reason in logs
      try {
        text = await res.text();
        console.error("YouTube API error:", res.status, text);
      } catch {
        console.error("YouTube API error:", res.status, "(no body)");
      }
      return { res: null, errorText: text };
    }
    return { res, errorText: undefined };
  } catch (err) {
    console.error(
      "YouTube API network error:",
      (err as Error)?.message || err
    );
    return { res: null, errorText: (err as Error)?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function ytSearch(q: string, max = 15): Promise<VideoResult[]> {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return [];
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      q,
      maxResults: String(Math.min(max, 15)),
      safeSearch: "none",
      key,
    }).toString();

    const { res } = await safeFetch(url.toString());
    if (!res) return [];
    let data: SearchResponse;
    try {
      data = (await res.json()) as SearchResponse;
    } catch {
      return [];
    }
    if (!Array.isArray(data.items)) return [];
    const results: VideoResult[] = [];
    for (const item of data.items) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      results.push({
        videoId,
        title: item.snippet?.title ?? "",
        channelTitle: item.snippet?.channelTitle ?? "",
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.default?.url ??
          "",
        publishedAt: item.snippet?.publishedAt ?? "",
      });
    }
    return results;
  } catch {
    return [];
  }
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

export async function ytVideos(ids: string[]): Promise<VideoStats[]> {
  try {
    if (!ids.length) return [];
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return [];
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      id: ids.slice(0, 50).join(","),
      key,
    }).toString();
    logCounter("yt_hydrate_requests");
    const { res, errorText } = await safeFetch(url.toString());
    if (!res) {
      if (errorText && errorText.includes("quotaExceeded")) {
        logCounter("yt_hydrate_quota_exceeded");
      }
      return [];
    }
    let data: VideosResponse;
    try {
      data = (await res.json()) as VideosResponse;
    } catch {
      return [];
    }
    if (!Array.isArray(data.items)) return [];
    const results: VideoStats[] = [];
    for (const item of data.items) {
      const id = item.id;
      if (!id) continue;
      results.push({
        videoId: id,
        durationSeconds: parseDuration(item.contentDetails?.duration ?? ""),
        viewCount: Number(item.statistics?.viewCount ?? 0),
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function resolveChannel(
  input: string
): Promise<{ channelId: string; channelTitle: string } | null> {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return null;
    let channelId = "";
    let username = "";

    const trimmed = input.trim();
    try {
      const url = new URL(trimmed);
      if (url.hostname.includes("youtube.com")) {
        const path = url.pathname.replace(/^\/+|\/+$/g, "");
        const idMatch = path.match(/^channel\/([A-Za-z0-9_-]+)/);
        if (idMatch) channelId = idMatch[1];
        else {
          const handleMatch = path.match(/^@([A-Za-z0-9._-]+)/);
          if (handleMatch) username = handleMatch[1];
          else {
            const parts = path.split("/");
            if ((parts[0] === "c" || parts[0] === "user") && parts[1]) {
              username = parts[1];
            }
          }
        }
      }
    } catch {
      if (trimmed.startsWith("@")) username = trimmed.slice(1);
      else channelId = trimmed;
    }

    const params: Record<string, string> = { part: "snippet", key };
    if (channelId) params.id = channelId;
    else if (username) params.forUsername = username;
    else return null;

    const url =
      "https://www.googleapis.com/youtube/v3/channels?" +
      new URLSearchParams(params).toString();
    const { res } = await safeFetch(url);
    if (!res) return null;
    let data: ChannelsResponse;
    try {
      data = (await res.json()) as ChannelsResponse;
    } catch {
      return null;
    }
    const item = data.items?.[0];
    if (!item?.id) return null;
    return { channelId: item.id, channelTitle: item.snippet?.title ?? "" };
  } catch {
    return null;
  }
}

export async function fetchChannelFeed(
  channelId: string
): Promise<VideoResult[]> {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
      channelId
    )}`;
    const { res: rssRes } = await safeFetch(rssUrl);
    if (rssRes) {
      try {
        const xml = await rssRes.text();
        const results: VideoResult[] = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match: RegExpExecArray | null;
        while ((match = entryRegex.exec(xml))) {
          const entry = match[1];
          const videoId =
            (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || "";
          if (!videoId) continue;
          const title = (entry.match(/<title>([^<]+)<\/title>/) || [])[1] || "";
          const channelTitle =
            (entry.match(/<author>\s*<name>([^<]+)<\/name>/) || [])[1] || "";
          const thumbnailUrl =
            (entry.match(/<media:thumbnail[^>]+url="([^"]+)"/) || [])[1] || "";
          const publishedAt =
            (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
          results.push({
            videoId,
            title,
            channelTitle,
            thumbnailUrl,
            publishedAt,
          });
        }
        if (results.length) return results;
      } catch {}
    }

    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return [];
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.search = new URLSearchParams({
      part: "snippet",
      channelId,
      order: "date",
      type: "video",
      maxResults: "15",
      key,
    }).toString();
    const { res } = await safeFetch(url.toString());
    if (!res) return [];
    let data: SearchResponse;
    try {
      data = (await res.json()) as SearchResponse;
    } catch {
      return [];
    }
    if (!Array.isArray(data.items)) return [];
    const results: VideoResult[] = [];
    for (const item of data.items) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      results.push({
        videoId,
        title: item.snippet?.title ?? "",
        channelTitle: item.snippet?.channelTitle ?? "",
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.default?.url ??
          "",
        publishedAt: item.snippet?.publishedAt ?? "",
      });
    }
    return results;
  } catch {
    return [];
  }
}
