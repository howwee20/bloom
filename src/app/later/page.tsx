"use client";
import { useEffect, useState } from "react";
import { listLater, removeLater, type LaterItem } from "@/lib/later";

export default function LaterPage() {
  const [items, setItems] = useState<LaterItem[]>([]);

  useEffect(() => {
    setItems(listLater());
  }, []);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="p-4 text-xl font-semibold flex items-center justify-between">
        <a href="/" className="text-orange-500">Bloom</a>
        <span className="text-sm text-slate-600">Watch Later</span>
      </header>

      <div className="max-w-5xl mx-auto px-4 pb-10">
        {items.length === 0 && (
          <div className="text-sm text-slate-500 mt-6">
            Nothing saved. Use “🔖 Save” on any card.
          </div>
        )}

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-6">
          {items.map((it) => (
            <a
              key={it.videoId}
              href={it.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className={[
                "relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm",
                "hover:shadow-md transition",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  removeLater(it.videoId);
                  setItems(listLater());
                }}
                className="absolute right-2 top-2 rounded-full px-2.5 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300"
                aria-label="Remove"
              >
                Remove
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={it.title} src={it.thumbnailUrl} className="w-full aspect-video object-cover" />
              <div className="p-3">
                <div className="text-xs text-slate-500">
                  Saved {new Date(it.savedAt).toLocaleString()}
                </div>
                <div className="text-sm text-slate-500">{it.channelTitle}</div>
                <div className="font-medium mt-1 line-clamp-2">{it.title}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

