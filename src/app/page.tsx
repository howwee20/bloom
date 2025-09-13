"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSaved, toggleSave } from "@/lib/library";
import PromptBar from "@/components/PromptBar";

interface Item {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  durationSeconds?: number;
  viewCount?: number;
}

const RESULTS_LIMIT = 8;

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const lastPromptRef = useRef("");
  const seenIdsRef = useRef<Set<string>>(new Set());
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  async function run(q: string, { respin }: { respin: boolean }) {
    if (!q) return;
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
      setDegraded(
        searchData?.degraded === true ||
          results.some(
            (r) => r.durationSeconds == null || r.viewCount == null
          )
      );
      for (const r of results) seenIdsRef.current.add(r.videoId);
      if (!respin) {
        lastPromptRef.current = q;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onSearch(e: any) {
      if (loading) return;
      const q: string = e.detail?.q ?? "";
      const trimmed = q.trim().toLowerCase();
      if (!trimmed) return;
      if (trimmed === "saved") {
        router.push("/saved");
        return;
      }
      run(q, { respin: false });
    }
    function onRespin() {
      if (loading) return;
      if (!lastPromptRef.current) return;
      run(lastPromptRef.current, { respin: true });
    }
    window.addEventListener("bloom:search", onSearch as any);
    window.addEventListener("bloom:respin", onRespin);
    return () => {
      window.removeEventListener("bloom:search", onSearch as any);
      window.removeEventListener("bloom:respin", onRespin);
    };
  }, [loading, router]);

  useEffect(() => {
    if (initialQ) {
      run(initialQ, { respin: false });
    }
  }, [initialQ]);

  return (
    <>
      <main className="min-h-[100svh] bg-white">
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-[88px]">
          {degraded && (
            <div className="mb-4 rounded border border-yellow-200 bg-yellow-100 p-2 text-center text-sm text-yellow-800">
              We’re running in low‑quota mode. Playing and saving still work; some
              stats are hidden.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {items.slice(0, RESULTS_LIMIT).map((it) => {
              const savedNow = isSaved(it.videoId);
              return (
                <a
                  key={it.videoId}
                  href={it.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition"
                >
                  <div className="aspect-video overflow-hidden relative">
                    <img
                      src={it.thumbnailUrl}
                      alt={it.title}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleSave({
                          videoId: it.videoId,
                          title: it.title,
                          channelTitle: it.channelTitle,
                          youtubeUrl: it.youtubeUrl,
                          thumbnailUrl: it.thumbnailUrl,
                        });
                        // Force a re-render so isSaved() reflects immediately
                        setItems((cur) => [...cur]);
                      }}
                      aria-label={savedNow ? "Saved" : "Save to Watch Later"}
                      className={`absolute right-2 top-2 rounded-full px-2.5 py-1.5 text-xs font-semibold shadow ${
                        savedNow
                          ? "bg-slate-700 text-white"
                          : "bg-orange-500 text-white hover:bg-orange-600"
                      }`}
                    >
                      {savedNow ? "✓ Saved" : "Save"}
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium">{it.title}</div>
                    <div className="text-xs text-gray-500">{it.channelTitle}</div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </main>
      <PromptBar initialValue={initialQ} initialSubmitted={initialQ} />
    </>
  );
}

