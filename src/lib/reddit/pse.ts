interface RedditSearchItem {
  title?: string;
  link?: string;
  displayLink?: string;
  pagemap?: any;
}

function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("reddit.com")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      try {
        const text = await res.text();
        console.error("Reddit PSE API error:", res.status, text);
      } catch {
        console.error("Reddit PSE API error:", res.status, "(no body)");
      }
      return null;
    }
    return res;
  } catch (err) {
    console.error("Reddit PSE API network error:", (err as Error)?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface RedditPseResult {
  title: string;
  url: string;
  displayLink?: string;
  image?: string | null;
}

export async function redditPseSearch(
  query: string,
  limit = 6,
): Promise<RedditPseResult[]> {
  const key = process.env.PSE_API_KEY;
  const cx = process.env.PSE_CX;
  if (!key || !cx) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  const baseQuery = `${trimmed} site:reddit.com -site:reddit.com/r/AskReddit`;

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.search = new URLSearchParams({
    key,
    cx,
    q: baseQuery,
    num: String(Math.min(limit, 10)),
    dateRestrict: "d2",
  }).toString();

  const res = await safeFetch(url.toString());
  if (!res) return [];

  let data: any;
  try {
    data = await res.json();
  } catch {
    return [];
  }

  const items: RedditPseResult[] = [];
  if (Array.isArray(data?.items)) {
    for (const item of data.items as RedditSearchItem[]) {
      const link = typeof item.link === "string" ? normalizeUrl(item.link) : null;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!link || !title) continue;

      let image: string | null = null;
      const pagemap = item.pagemap || {};
      const meta = Array.isArray(pagemap?.metatags) ? pagemap.metatags[0] : null;
      if (meta && typeof meta === "object") {
        const candidate = meta["og:image"];
        if (typeof candidate === "string" && candidate) {
          image = candidate;
        }
      }
      if (!image && Array.isArray(pagemap?.cse_thumbnail)) {
        const thumb = pagemap.cse_thumbnail[0]?.src;
        if (typeof thumb === "string" && thumb) {
          image = thumb;
        }
      }

      items.push({
        title,
        url: link,
        displayLink: typeof item.displayLink === "string" ? item.displayLink : undefined,
        image,
      });

      if (items.length >= limit) break;
    }
  }

  return items;
}
