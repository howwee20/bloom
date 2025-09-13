"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PromptBar from "@/components/PromptBar";
import { loadLibrary, removeVideo, SavedItem } from "@/lib/library";

function buildDeckFromOffset(list: SavedItem[], offset: number, need = 8) {
  const out: SavedItem[] = [];
  if (!list.length) return out;
  let i = 0;
  while (out.length < need) {
    const next = list[(offset + i) % list.length];
    const prev = out[out.length - 1];
    if (!prev || prev.videoId !== next.videoId) out.push(next);
    i++;
  }
  return out;
}

export default function SavedPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [offset, setOffset] = useState(0); // for respin/paging

  function refresh() {
    const lib = loadLibrary();
    lib.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    // clamp offset if list shrank
    setOffset((o) => (lib.length ? o % lib.length : 0));
    setItems(lib);
  }

  useEffect(() => {
    refresh();
    // keep in sync if user un-saves from another tab
    const onStorage = (e: StorageEvent) => {
      if (e.key === "watchLater") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const deck = useMemo(() => buildDeckFromOffset(items, offset, 8), [items, offset]);

  const respin = () => {
    const len = Math.max(items.length, 1);
    setOffset((o) => (o + 8) % len);
    window.dispatchEvent(new Event("bloom:done"));
  };

  return (
    <main className="min-h-[100svh] bg-white">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-[88px]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-slate-600">
            Saved ({items.length}) — showing 8 always{items.length < 8 ? " • repeats to fill" : ""}
          </div>
          <Link href="/" className="text-sm underline">Back to Bloom</Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {deck.map((v, idx) => (
            <div
              key={`${v.videoId}-${idx}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key.toLowerCase() === "s") {
                  removeVideo(v.videoId);
                  refresh();
                }
              }}
              className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="relative">
                <a href={v.youtubeUrl} target="_blank" rel="noreferrer" className="block">
                  <div className="aspect-video overflow-hidden">
                    <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                  </div>
                </a>
                {/* Un-save pill (top-right) */}
                <button
                  onClick={() => {
                    removeVideo(v.videoId);
                    refresh();
                  }}
                  className="absolute top-2 right-2 px-2 py-1 rounded-full bg-slate-800 text-white text-xs font-medium"
                  aria-label="Unsave"
                  title="Unsave"
                >
                  ✓ Saved
                </button>
              </div>
              <div className="p-3">
                <div className="text-sm font-medium line-clamp-2">{v.title}</div>
                <div className="text-xs text-slate-500 mt-1">{v.channelTitle ?? "—"}</div>
              </div>
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="mt-6 text-sm text-slate-600">
            Nothing saved yet. Go back and hit <span className="font-medium">Save</span> on any card.
          </div>
        )}
      </div>

      {/* Shared bottom prompt bar — here it paginates Saved deck and can also jump to search */}
      <PromptBar
        onRespin={respin}
        onSubmit={(q) => router.push("/?q=" + encodeURIComponent(q))}
        placeholder="Type to search • Respin rotates your saved"
      />
    </main>
  );
}

