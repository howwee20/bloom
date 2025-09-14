const YT_API = "https://www.googleapis.com/youtube/v3";

function buildCommentsURL(videoId: string, key: string) {
  const u = new URL(`${YT_API}/commentThreads`);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("videoId", videoId);
  u.searchParams.set("maxResults", "2");
  u.searchParams.set("order", "relevance");
  u.searchParams.set("textFormat", "plainText"); // returns plain text in textDisplay
  u.searchParams.set("key", key);
  return u.toString();
}

export async function fetchTopCommentsForId(videoId: string): Promise<import("./types").YTComment[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const url = buildCommentsURL(videoId, key);

  // Cache on Vercel for 24h to protect quota
  const r = await fetch(url, { next: { revalidate: 86400 } });
  if (!r.ok) return [];

  const json = await r.json();
  const items = Array.isArray(json.items) ? json.items : [];

  return items.map((it: any) => {
    const s = it?.snippet?.topLevelComment?.snippet;
    return {
      id: it?.id ?? "",
      author: s?.authorDisplayName ?? "Unknown",
      text: (s?.textDisplay ?? "").toString(), // plain text due to textFormat=plainText
      likes: typeof s?.likeCount === "number" ? s.likeCount : undefined,
      publishedAt: s?.publishedAt ?? undefined,
    };
  });
}

// Batch wrapper with concurrency limit
export async function fetchTopCommentsBatch(
  ids: string[],
  limit = 3,
): Promise<Record<string, import("./types").YTComment[]>> {
  const q: string[] = [...new Set(ids)]; // dedupe
  const out: Record<string, import("./types").YTComment[]> = {};
  let i = 0;

  async function worker() {
    while (i < q.length) {
      const idx = i++;
      const id = q[idx];
      try {
        // Per-video timeout ~1s to stay snappy
        const res = await Promise.race([
          fetchTopCommentsForId(id),
          new Promise<import("./types").YTComment[]>((resolve) =>
            setTimeout(() => resolve([]), 1000),
          ),
        ]);
        out[id] = res.slice(0, 2);
      } catch {
        out[id] = [];
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, q.length) }, worker));
  return out;
}
