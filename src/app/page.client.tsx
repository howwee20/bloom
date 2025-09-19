"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PromptBar from "@/components/PromptBar";
import RedditStrip from "@/components/RedditStrip";
import { isSaved, toggleSave } from "@/lib/library";
import type { YTComment } from "@/lib/youtube/types";
import { extractYouTubeId } from "@/lib/youtube/utils";

interface Item {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  durationSeconds?: number;
  viewCount?: number;
}

interface HomeClientProps {
  initialFeed: Item[];
  initialDegraded: boolean;
  defaultQueries: string[];
}

const FEED_MODE = process.env.NEXT_PUBLIC_FEED_MODE === "1";
const FEED_RESULTS_LIMIT = 12;
const RESULTS_LIMIT = FEED_MODE ? FEED_RESULTS_LIMIT : 4;
const ENABLE_YT_COMMENTS =
  process.env.NEXT_PUBLIC_ENABLE_YT_COMMENTS !== "0";
const ENABLE_REDDIT_STRIP =
  process.env.NEXT_PUBLIC_ENABLE_REDDIT_STRIP === "1" ||
  process.env.ENABLE_REDDIT_STRIP === "1";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "will",
  "says",
  "after",
  "over",
  "into",
  "about",
  "your",
  "their",
  "them",
  "they",
  "you",
  "our",
  "are",
  "was",
  "were",
  "been",
  "being",
  "just",
  "more",
  "less",
  "than",
  "its",
  "it's",
  "new",
  "news",
  "live",
  "update",
  "updates",
  "breaking",
  "latest",
  "watch",
  "today",
  "tonight",
  "video",
]);

function isSignificantWord(word: string): boolean {
  if (!word) return false;
  const cleaned = word.replace(/^["'`]+|["'`]+$/g, "");
  if (cleaned.length < 3) return false;
  const lower = cleaned.toLowerCase();
  if (STOPWORDS.has(lower)) return false;
  const first = cleaned[0];
  const isLetter = /[A-Za-z]/.test(first);
  if (!isLetter) return false;
  const isAllCaps = cleaned === cleaned.toUpperCase();
  const startsUpper = first === first.toUpperCase();
  return startsUpper || isAllCaps;
}

function deriveTopics(items: Item[]): string[] {
  const singles = new Map<string, { label: string; count: number }>();
  const bigrams = new Map<string, { label: string; count: number }>();

  for (const item of items.slice(0, RESULTS_LIMIT)) {
    const candidates = [item.title, item.channelTitle].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    for (const text of candidates) {
      const words = text.match(/[A-Za-z][A-Za-z0-9'&-]*/g);
      if (!words) continue;
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (isSignificantWord(word)) {
          const key = word.toLowerCase();
          const prev = singles.get(key);
          if (prev) {
            prev.count += 1;
          } else {
            singles.set(key, { label: word, count: 1 });
          }
        }
        if (i < words.length - 1) {
          const next = words[i + 1];
          if (isSignificantWord(word) && isSignificantWord(next)) {
            const phrase = `${word} ${next}`;
            const key = phrase.toLowerCase();
            const prev = bigrams.get(key);
            if (prev) {
              prev.count += 1;
            } else {
              bigrams.set(key, { label: phrase, count: 1 });
            }
          }
        }
      }
    }
  }

  const scored: { label: string; score: number; type: "single" | "bigram" }[] = [];
  for (const value of bigrams.values()) {
    scored.push({ label: value.label, score: value.count * 2 + 0.5, type: "bigram" });
  }
  for (const value of singles.values()) {
    scored.push({ label: value.label, score: value.count, type: "single" });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.type !== b.type) return a.type === "bigram" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of scored) {
    const normalized = entry.label.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(entry.label);
    if (result.length >= 3) break;
  }

  return result;
}

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

export default function HomeClient({
  initialFeed,
  initialDegraded,
  defaultQueries,
}: HomeClientProps) {
  const [items, setItems] = useState<Item[]>(initialFeed);
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState(initialDegraded);
  const [ytComments, setYtComments] = useState<Record<string, YTComment[]>>({});
  const lastPromptRef = useRef("");
  const seenIdsRef = useRef<Set<string>>(new Set(initialFeed.map((it) => it.videoId)));
  const feedLoadedRef = useRef(initialFeed.length > 0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = FEED_MODE ? "" : searchParams.get("q") ?? "";

  const redditTopics = useMemo(() => {
    if (!ENABLE_REDDIT_STRIP) return [];
    if (!items.length) return [];
    const derived = deriveTopics(items);
    if (derived.length === 0) {
      return ["breaking news"];
    }
    return derived.slice(0, 3);
  }, [items]);

  const runSearch = useCallback(
    async (q: string, { respin }: { respin: boolean }) => {
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
              (r) => r.durationSeconds == null || r.viewCount == null,
            ),
        );
        for (const r of results) seenIdsRef.current.add(r.videoId);
        if (!respin) {
          lastPromptRef.current = q;
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadFeed = useCallback(
    async ({ respin }: { respin: boolean }) => {
      setLoading(true);
      try {
        if (!respin) {
          seenIdsRef.current = new Set();
        }
        const searchBody: any = { queries: defaultQueries };
        if (respin) {
          searchBody.excludeIds = Array.from(seenIdsRef.current);
          searchBody.seed = Date.now() % 1_000_000;
        }
        const searchRes = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(searchBody),
        });
        const searchData = await searchRes.json().catch(() => ({}));
        const results: Item[] = Array.isArray((searchData as any)?.results)
          ? (searchData as any).results
          : [];
        setItems(results);
        setDegraded(
          (searchData as any)?.degraded === true ||
            results.some(
              (r) => r.durationSeconds == null || r.viewCount == null,
            ),
        );
        for (const r of results) {
          seenIdsRef.current.add(r.videoId);
        }
        lastPromptRef.current = "";
      } catch {
        setItems([]);
        setDegraded(true);
      } finally {
        setLoading(false);
      }
    },
    [defaultQueries],
  );

  useEffect(() => {
    async function onSearch(e: any) {
      try {
        if (loading) return;
        if (FEED_MODE) return;
        const q: string = e.detail?.q ?? "";
        const trimmed = q.trim().toLowerCase();
        if (!trimmed) return;
        if (trimmed === "saved") {
          router.push("/saved");
          return;
        }
        await runSearch(q, { respin: false });
      } finally {
        window.dispatchEvent(new Event("bloom:done"));
      }
    }
    async function onRespin() {
      try {
        if (loading) return;
        if (FEED_MODE) {
          await loadFeed({ respin: true });
          return;
        }
        if (!lastPromptRef.current) return;
        await runSearch(lastPromptRef.current, { respin: true });
      } finally {
        window.dispatchEvent(new Event("bloom:done"));
      }
    }
    window.addEventListener("bloom:search", onSearch as any);
    window.addEventListener("bloom:respin", onRespin as any);
    return () => {
      window.removeEventListener("bloom:search", onSearch as any);
      window.removeEventListener("bloom:respin", onRespin as any);
    };
  }, [FEED_MODE, loadFeed, loading, router, runSearch]);

  useEffect(() => {
    if (!FEED_MODE && initialQ) {
      runSearch(initialQ, { respin: false });
    }
  }, [FEED_MODE, initialQ, runSearch]);

  useEffect(() => {
    if (!FEED_MODE) return;
    if (feedLoadedRef.current) return;
    feedLoadedRef.current = true;
    loadFeed({ respin: false });
  }, [FEED_MODE, loadFeed]);

  useEffect(() => {
    if (!ENABLE_YT_COMMENTS) return;
    const visible = items.slice(0, RESULTS_LIMIT);
    const ids = visible
      .map((it) => extractYouTubeId(it.youtubeUrl))
      .filter((id): id is string => !!id);
    if (ids.length === 0) return;
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return;
    const params = new URLSearchParams();
    params.set("ids", unique.slice(0, RESULTS_LIMIT).join(","));
    params.set("max", "3");
    setYtComments({});
    fetch(`/api/yt/comments?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((map) => {
        if (map && typeof map === "object" && !Array.isArray(map)) {
          setYtComments(map as Record<string, YTComment[]>);
        }
      })
      .catch(() => {});
  }, [RESULTS_LIMIT, items]);

  return (
    <Suspense fallback={null}>
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
                const ytId = extractYouTubeId(it.youtubeUrl);
                const comments = ytId ? ytComments[ytId] : undefined;
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
                            thumbnailUrl: it.thumbnailUrl,
                            youtubeUrl: it.youtubeUrl,
                          });
                          window.dispatchEvent(new CustomEvent("bloom:saved"));
                        }}
                        className={`absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium shadow-sm transition ${
                          savedNow ? "text-red-600" : "text-slate-700"
                        }`}
                      >
                        {savedNow ? "Saved" : "Save"}
                      </button>
                    </div>
                    <div className="p-3">
                      <div className="mb-2 line-clamp-2 text-sm font-semibold text-slate-900">
                        {it.title}
                      </div>
                      <div className="text-xs text-slate-600">{it.channelTitle}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <div>
                          {it.viewCount != null
                            ? `${it.viewCount.toLocaleString()} views`
                            : "views hidden"}
                        </div>
                        <div>
                          {it.durationSeconds != null
                            ? `${Math.floor(it.durationSeconds / 60)}:${(it.durationSeconds % 60)
                                .toString()
                                .padStart(2, "0")}`
                            : "--:--"}
                        </div>
                      </div>
                      {comments && comments.length > 0 && (
                        <div className="mt-3 rounded-lg bg-slate-50 p-2">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Top comments
                          </div>
                          <ul className="space-y-1">
                            {comments.slice(0, 3).map((comment) => (
                              <li key={comment.id} className="text-[11px] text-slate-600">
                                “{comment.text}”
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
            <div className="mt-6 flex flex-col gap-4 lg:flex-row">
              <div className="w-full lg:w-3/5">
                <PromptBar disabled={loading} Spinner={Spinner} />
              </div>
              {ENABLE_REDDIT_STRIP && redditTopics.length > 0 && (
                <div className="w-full lg:w-2/5">
                  <RedditStrip topics={redditTopics} />
                </div>
              )}
            </div>
          </div>
        </main>
      </>
    </Suspense>
  );
}

export type { Item };
