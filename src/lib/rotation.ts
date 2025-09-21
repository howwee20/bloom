export function seedFromDate(date: string): number {
  if (!date) return 0;
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < date.length; i += 1) {
    hash ^= date.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 0x100000000;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = items.slice();
  if (result.length <= 1) return result;
  const rand = mulberry32(seed >>> 0);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function nextIndex(
  current: number,
  seen: Set<number>,
  total: number,
): number {
  if (total <= 0) return 0;
  const normalizedCurrent = ((current % total) + total) % total;
  const normalizedSeen = new Set<number>();
  for (const value of seen) {
    if (Number.isInteger(value) && value >= 0 && value < total) {
      normalizedSeen.add(value);
    }
  }
  if (normalizedSeen.size >= total) {
    return (normalizedCurrent + 1) % total;
  }
  for (let offset = 1; offset <= total; offset += 1) {
    const candidate = (normalizedCurrent + offset) % total;
    if (!normalizedSeen.has(candidate)) {
      return candidate;
    }
  }
  return normalizedCurrent;
}
