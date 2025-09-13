"use client";

import { useState, useRef } from "react";

interface Item {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
}

const RESULTS_LIMIT = 8;

export default function Home() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const lastPromptRef = useRef("");
  const seenIdsRef = useRef<Set<string>>(new Set());
  const buttonLabel = q === lastPromptRef.current ? "Respin" : "Bloom it";

  async function run({ respin }: { respin: boolean }) {
    setLoading(true);
    try {
      const intentBody: any = { prompt: q };
      if (!respin) {
        seenIdsRef.current = new Set();
      }

      const intentRes = await fetch("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intentBody),
      });
      const intentData = await intentRes.json();
      const queries: string[] = Array.isArray(intentData?.queries)
        ? intentData.queries
        : [q];

      const searchBody: any = { queries };
      if (respin) {
        searchBody.excludeIds = Array.from(seenIdsRef.current);
        searchBody.seed = Date.now() % 1_000_000;
      }

      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(searchBody),
      });
      const searchData = await searchRes.json();
      const results: Item[] = Array.isArray(searchData?.results)
        ? searchData.results
        : [];
      setItems(results);
      for (const r of results) seenIdsRef.current.add(r.videoId);
      if (!respin) {
        lastPromptRef.current = q;
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (loading) return;
    run({ respin: q === lastPromptRef.current });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Don’t fire while composing (IME), and don’t double-trigger while loading
    // Also allow Shift+Enter future multiline if we ever switch to <textarea>
    if (e.nativeEvent.isComposing || loading) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // "dirty" means q !== lastPromptRef.current
      const dirty = q.trim() !== lastPromptRef.current.trim();
      run({ respin: !dirty });
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 p-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {items.slice(0, RESULTS_LIMIT).map((it) => (
            <a
              key={it.videoId}
              href={it.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col"
            >
              <img
                src={it.thumbnailUrl}
                alt={it.title}
                className="w-full h-auto rounded"
              />
              <div className="mt-2 text-sm font-medium">{it.title}</div>
              <div className="text-xs text-gray-500">{it.channelTitle}</div>
            </a>
          ))}
        </div>
      </main>
      <div className="p-4 border-t flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to watch..."
        />
        <button
          onClick={handleClick}
          className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white"
          disabled={loading}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

