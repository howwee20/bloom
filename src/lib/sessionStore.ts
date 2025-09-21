export type QueueState = {
  order: number[];
  seen: number[];
  current: number;
};

const KEY_PREFIX = "bloom:queue:";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function buildKey(date: string): string {
  return `${KEY_PREFIX}${date}`;
}

function isQueueState(value: unknown): value is QueueState {
  if (!value || typeof value !== "object") return false;
  const data = value as QueueState;
  return (
    Array.isArray(data.order) &&
    Array.isArray(data.seen) &&
    typeof data.current === "number"
  );
}

export function getQueue(date: string): QueueState | null {
  if (!date) return null;
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(buildKey(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isQueueState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setQueue(date: string, data: QueueState): void {
  if (!date) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(buildKey(date), JSON.stringify(data));
  } catch {
    /* ignore persistence errors */
  }
}

export function clearQueue(date: string): void {
  if (!date) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(buildKey(date));
  } catch {
    /* ignore */
  }
}
