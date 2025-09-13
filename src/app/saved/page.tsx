"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SavedItem = {
  videoId: string; title: string; channelTitle?: string;
  youtubeUrl: string; thumbnailUrl: string; savedAt?: number;
};

function buildDeck(list: SavedItem[], need = 8) {
  const out: SavedItem[] = []; if (!list.length) return out;
  let i = 0;
  while (out.length < need) {
    const next = list[i % list.length], prev = out[out.length - 1];
    if (!prev || prev.videoId !== next.videoId) out.push(next);
    i++;
  } return out;
}

export default function SavedPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("watchLater") || "[]";
      const parsed: SavedItem[] = JSON.parse(raw);
      parsed.sort((a,b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
      setItems(parsed);
    } catch { setItems([]); }
  }, []);
  const deck = useMemo(() => buildDeck(items, 8), [items]);

  return (
    <main className="min-h-[100svh] bg-white">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-[88px]">
        <div className="mb-3 text-sm text-slate-600">
          Saved ({items.length}) — showing 8 always{items.length < 8 ? " • repeats to fill" : ""}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {deck.map((v, idx) => (
            <a key={`${v.videoId}-${idx}`} href={v.youtubeUrl} target="_blank" rel="noreferrer"
               className="block rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition">
              <div className="aspect-video overflow-hidden">
                <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
              </div>
              <div className="p-3">
                <div className="text-sm font-medium line-clamp-2">{v.title}</div>
                <div className="text-xs text-slate-500 mt-1">{v.channelTitle ?? "—"}</div>
              </div>
            </a>
          ))}
        </div>
        {items.length === 0 && (
          <div className="mt-6 text-sm text-slate-600">
            Nothing saved yet. Go back and hit <span className="font-medium">Save</span> on any card.
          </div>
        )}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
          <Link href="/" className="px-4 py-2 rounded-full bg-black text-white text-sm shadow hover:opacity-90">
            Back to Bloom
          </Link>
        </div>
      </div>
    </main>
  );
}

