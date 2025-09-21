"use client";

export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSaved, toggleSave } from "@/lib/library";
import type { YTComment } from "@/lib/youtube/types";
import { extractYouTubeId } from "@/lib/youtube/utils";
import RedditStrip from "@/components/RedditStrip";
import {
  getDaily,
  DailyNotFoundError,
  type DailyItem,
} from "@/lib/fetchDaily";

type Item = DailyItem;

const RESULTS_LIMIT = 12;
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
    const candidates = [item.title].filter(
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

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toFriendlyDate(dateString: string): string {
  if (!dateString) return "";
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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

function RespinButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 bg-white/80 backdrop-blur border-t">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClick}
            disabled={loading}
            aria-busy={loading ? "true" : "false"}
            className="px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-sm font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            {loading ? "Searching…" : "Respin"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [dailyDate, setDailyDate] = useState<string>("");
  const [previousDate, setPreviousDate] = useState<string | null>(null);
  const [ytComments, setYtComments] = useState<
    Record<string, YTComment[]>
  >({});
  const lastQueryRef = useRef("");
  const feedLoadedRef = useRef(false);
  const loadingRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const redditTopics = useMemo(() => {
    if (!ENABLE_REDDIT_STRIP) return [];
    if (!items.length) return [];
    const derived = deriveTopics(items);
    if (derived.length === 0) {
      return ["breaking news"];
    }
    return derived.slice(0, 3);
  }, [items]);

  const loadDaily = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearchMessage(null);
    try {
      const daily = await getDaily();
      setAllItems(daily.items);
      setItems(daily.items);
      setDailyDate(daily.date);
      setPreviousDate(null);
      lastQueryRef.current = "";
      return daily.items;
    } catch (err) {
      setAllItems([]);
      setItems([]);
      setDailyDate("");
      if (err instanceof DailyNotFoundError) {
        setPreviousDate(err.previousDate ?? null);
        setError("We don't have a curated list for today yet. Check back soon!");
      } else {
        setPreviousDate(null);
        setError("We couldn't load today's curated picks. Please try again soon.");
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const runSearch = useCallback(
    async (q: string, options?: { source?: Item[] }) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setLoading(true);
      try {
        const normalized = trimmed.toLowerCase();
        const base = options?.source ?? allItems;
        const matches = base.filter((item) =>
          item.title.toLowerCase().includes(normalized),
        );
        setItems(matches);
        setSearchMessage(
          matches.length === 0
            ? `No matches for “${trimmed}” in today's picks.`
            : null,
        );
        lastQueryRef.current = trimmed;
      } finally {
        setLoading(false);
      }
    },
    [allItems],
  );

  useEffect(() => {
    if (feedLoadedRef.current) return;
    const trimmed = initialQ.trim();
    feedLoadedRef.current = true;
    (async () => {
      const loaded = await loadDaily();
      if (trimmed) {
        await runSearch(trimmed, { source: loaded });
      }
    })();
  }, [initialQ, loadDaily, runSearch]);

  useEffect(() => {
    async function onSearch(e: any) {
      try {
        if (loadingRef.current) return;
        const q: string = e.detail?.q ?? "";
        const trimmed = q.trim();
        if (!trimmed) return;
        if (trimmed.toLowerCase() === "saved") {
          router.push("/saved");
          return;
        }
        await runSearch(trimmed);
      } finally {
        window.dispatchEvent(new Event("bloom:done"));
      }
    }
    async function onRespin() {
      try {
        if (loadingRef.current) return;
        const loaded = await loadDaily();
        if (lastQueryRef.current) {
          await runSearch(lastQueryRef.current, { source: loaded });
        }
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
  }, [loadDaily, router, runSearch]);

  const handleRespinClick = useCallback(() => {
    if (loadingRef.current) return;
    window.dispatchEvent(new CustomEvent("bloom:respin"));
  }, []);

  useEffect(() => {
    if (!ENABLE_YT_COMMENTS) return;
    const visible = items.slice(0, RESULTS_LIMIT);
    const ids = visible
      .map((it) => it.id || extractYouTubeId(it.url))
      .filter((id): id is string => !!id);
    setYtComments({});
    if (ids.length === 0) return;
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return;
    const params = new URLSearchParams();
    params.set("ids", unique.slice(0, RESULTS_LIMIT).join(","));
    params.set("max", "3");
    fetch(`/api/yt/comments?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((map) => {
        if (map && typeof map === "object" && !Array.isArray(map)) {
          setYtComments(map as Record<string, YTComment[]>);
        }
      })
      .catch(() => {});
  }, [items]);

  const todayKey = formatDateKey(new Date());
  const fallbackActive = dailyDate ? dailyDate !== todayKey : false;
  const friendlyDate = dailyDate ? toFriendlyDate(dailyDate) : "";
  const showAlert = Boolean(error);
  const showGrid = items.length > 0;

  return (
    <Suspense fallback={null}>
      <>
        <main className="min-h-[100svh] bg-white">
          <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-[88px]">
            {showAlert ? (
              <div className="mb-4 rounded border border-yellow-200 bg-yellow-100 p-2 text-center text-sm text-yellow-800">
                {error}
              </div>
            ) : null}
            {fallbackActive && !showAlert && friendlyDate ? (
              <div className="mb-4 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-700">
                Today's picks aren't ready yet. Showing {friendlyDate} instead.
              </div>
            ) : null}
            {!fallbackActive && friendlyDate && showGrid ? (
              <div className="mb-4 text-sm text-black/70">
                Today's curated list for {friendlyDate}.
              </div>
            ) : null}
            {showGrid ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {items.slice(0, RESULTS_LIMIT).map((it) => {
                  const savedNow = isSaved(it.id);
                  const ytId = it.id || extractYouTubeId(it.url);
                  const comments = ytId ? ytComments[ytId] : undefined;
                  const meta: string[] = [];
                  if (it.rank != null) meta.push(`#${it.rank}`);
                  meta.push("YouTube");
                  if (it.duration) meta.push(it.duration);
                  return (
                    <a
                      key={it.id}
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition"
                    >
                      <div className="aspect-video overflow-hidden relative">
                        <img
                          src={it.thumb}
                          alt={it.title}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleSave({
                              videoId: it.id,
                              title: it.title,
                              channelTitle: "YouTube",
                              youtubeUrl: it.url,
                              thumbnailUrl: it.thumb,
                            });
                            setItems((cur) => [...cur]);
                          }}
                          aria-label={savedNow ? "Saved" : "Save to Watch Later"}
                          className={`absolute right-2 top-2 rounded-full px-2.5 py-1.5 text-xs font-semibold shadow ${
                            savedNow
                              ? "bg-slate-700 text-white"
                              : "bg-red-500 text-white hover:bg-red-600"
                          }`}
                        >
                          {savedNow ? "✓ Saved" : "Save"}
                        </button>
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-medium leading-snug line-clamp-2">
                          {it.title}
                        </div>
                        <div className="mt-1 text-xs text-black/80">
                          {meta.join(" • ")}
                        </div>
                        {ENABLE_YT_COMMENTS && ytId && comments && comments.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {comments.slice(0, 3).map((c) => (
                              <div
                                key={c.id}
                                className="text-sm text-black/80 leading-snug line-clamp-2"
                              >
                                <span className="italic">“{c.text}”</span>{" "}
                                <span className="text-black/60">— {c.author}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : !loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-black/70">
                {error ? (
                  <div className="space-y-3">
                    <p>{error}</p>
                    {previousDate ? (
                      <a
                        href={`/daily/${previousDate}.json`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:underline"
                      >
                        View yesterday's list
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p>{searchMessage ?? "No videos match your search yet."}</p>
                )}
              </div>
            ) : null}
            {showGrid && ENABLE_REDDIT_STRIP && redditTopics.length > 0 ? (
              <RedditStrip topics={redditTopics} />
            ) : null}
          </div>
        </main>
        <RespinButton loading={loading} onClick={handleRespinClick} />
      </>
    </Suspense>
  );
}

