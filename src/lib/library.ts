// Client-only helpers for the Saved Library
export type SavedItem = {
  videoId: string;
  title: string;
  channelTitle?: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  savedAt?: number;
};

const LIB_KEY = "watchLater";

function read(): SavedItem[] {
  try {
    const raw = localStorage.getItem(LIB_KEY) || "[]";
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // normalize older/minimal entries
    return arr
      .filter(Boolean)
      .map((v: any) => ({
        videoId: String(v.videoId ?? v.id ?? ""),
        title: String(v.title ?? v.snippet?.title ?? v.name ?? ""),
        channelTitle:
          v.channelTitle ?? v.snippet?.channelTitle ?? v.author ?? undefined,
        youtubeUrl:
          v.youtubeUrl ??
          (v.videoId ? `https://www.youtube.com/watch?v=${v.videoId}` : ""),
        thumbnailUrl:
          v.thumbnailUrl ??
          (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` : ""),
        savedAt: typeof v.savedAt === "number" ? v.savedAt : 0,
      }))
      .filter((v: SavedItem) => v.videoId);
  } catch {
    return [];
  }
}

function write(items: SavedItem[]) {
  localStorage.setItem(LIB_KEY, JSON.stringify(items));
}

export function loadLibrary(): SavedItem[] {
  return read();
}

export function isSaved(videoId: string): boolean {
  return read().some((v) => v.videoId === videoId);
}

export function saveVideo(item: SavedItem) {
  const cur = read();
  if (cur.some((v) => v.videoId === item.videoId)) return; // idempotent
  cur.unshift({ ...item, savedAt: Date.now() });
  write(cur);
}

export function removeVideo(videoId: string) {
  const cur = read().filter((v) => v.videoId !== videoId);
  write(cur);
}

export function toggleSave(item: SavedItem): boolean {
  const cur = read();
  const idx = cur.findIndex((v) => v.videoId === item.videoId);
  if (idx >= 0) {
    cur.splice(idx, 1);
    write(cur);
    return false;
  } else {
    cur.unshift({ ...item, savedAt: Date.now() });
    write(cur);
    return true;
  }
}

