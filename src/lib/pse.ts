interface SearchItem {
  link?: string;
  pagemap?: any;
}

async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      try {
        const text = await res.text();
        console.error("PSE API error:", res.status, text);
      } catch {
        console.error("PSE API error:", res.status, "(no body)");
      }
      return null;
    }
    return res;
  } catch (err) {
    console.error(
      "PSE API network error:",
      (err as Error)?.message || err,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function pseSearch(
  q: string,
  n = 10,
  start = 1,
): Promise<{ videoIds: string[]; raw: any }> {
  try {
    const key = process.env.PSE_API_KEY;
    const cx = process.env.PSE_CX;
    if (!key || !cx) return { videoIds: [], raw: null };
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.search = new URLSearchParams({
      key,
      cx,
      q,
      num: String(Math.min(n, 10)),
      start: String(start),
    }).toString();
    const res = await safeFetch(url.toString());
    if (!res) return { videoIds: [], raw: null };
    let data: any;
    try {
      data = await res.json();
    } catch {
      return { videoIds: [], raw: null };
    }
    const ids: string[] = [];
    const seen = new Set<string>();
    if (Array.isArray(data.items)) {
      for (const item of data.items as SearchItem[]) {
        const link = item.link;
        if (typeof link !== "string") continue;
        let id = "";
        try {
          const u = new URL(link);
          if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
            id = u.searchParams.get("v") || "";
          }
        } catch {}
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= n) break;
      }
    }
    return { videoIds: ids, raw: data };
  } catch {
    return { videoIds: [], raw: null };
  }
}
