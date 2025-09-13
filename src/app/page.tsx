"use client";

import { useState, useRef } from "react";
import type { KeyboardEvent } from "react";

interface Item {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
}

const RESULTS_LIMIT = 20;

export default function Home() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [, setLoading] = useState(false);
  const [, setErr] = useState("");
  const lastPromptRef = useRef<string>("");
  const seenRef = useRef<Set<string>>(new Set());

  const dirty = q.trim() !== lastPromptRef.current.trim();
  const buttonLabel = dirty ? "Bloom it" : "Respin";

  async function run({ respin }: { respin: boolean }) {
    setLoading(true);
    setErr("");
    try {
      // 1) intent (no refine)
      const intent = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      }).then((r) => r.json());

      // 2) search (pass fresh/exclude/seed for respin)
      const body: any = {
        queries: intent.queries,
      };
      if (respin) {
        body.fresh = true;
        body.excludeIds = Array.from(seenRef.current);
        body.seed = Date.now() % 1_000_000;
      } else {
        // first run for a new prompt: reset seen set
        seenRef.current = new Set();
      }

      const data = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());

      const results = Array.isArray(data?.results) ? data.results : [];
      setItems(results);
      results.forEach((v: any) => seenRef.current.add(v.videoId));

      // commit prompt after any successful run
      lastPromptRef.current = q;
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function onClick() {
    run({ respin: !dirty });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") run({ respin: !dirty });
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
          onKeyDown={onKeyDown}
          placeholder="Describe what you want to watch..."
        />
        <button
          onClick={onClick}
          className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

