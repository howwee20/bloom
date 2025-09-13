export type LaterItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  savedAt: string; // ISO
};

const KEY = "bloom.watchlater.v1";

function safeRead(): LaterItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function safeWrite(items: LaterItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
}

export function listLater(): LaterItem[] {
  return safeRead();
}

export function isLater(videoId: string): boolean {
  return safeRead().some((x) => x.videoId === videoId);
}

export function addLater(item: Omit<LaterItem, "savedAt">): boolean {
  const cur = safeRead();
  if (cur.some((x) => x.videoId === item.videoId)) return false;
  const next: LaterItem[] = [{ ...item, savedAt: new Date().toISOString() }, ...cur];
  safeWrite(next);
  return true;
}

export function removeLater(videoId: string) {
  safeWrite(safeRead().filter((x) => x.videoId !== videoId));
}

