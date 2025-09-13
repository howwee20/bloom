"use client";

import { useState, useRef } from "react";

interface Item {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
}

const refinements = ["weirder", "newer", "longer"] as const;
const RESULTS_LIMIT = 30;

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const lastPromptRef = useRef("");
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refineIndexRef = useRef(0);

  const buttonLabel =
    prompt === lastPromptRef.current ? "Respin" : "Bloom it";

  const handleClick = async () => {
    const isRespin = prompt === lastPromptRef.current;
    const intentBody: any = { prompt };
    if (isRespin) {
      const refine = refinements[
        refineIndexRef.current % refinements.length
      ];
      intentBody.refine = refine;
      refineIndexRef.current = (refineIndexRef.current + 1) % refinements.length;
    } else {
      seenIdsRef.current = new Set();
      refineIndexRef.current = 0;
    }

    const intentRes = await fetch("/api/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intentBody),
    });
    const intentData = await intentRes.json();
    const queries: string[] = Array.isArray(intentData?.queries)
      ? intentData.queries
      : [prompt];

    const searchBody: any = { queries };
    if (isRespin) {
      searchBody.excludeIds = Array.from(seenIdsRef.current);
      searchBody.seed = Date.now();
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
    if (!isRespin) {
      lastPromptRef.current = prompt;
    }
  };

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
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to watch..."
        />
        <button
          onClick={handleClick}
          className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

