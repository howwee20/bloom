"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadLibrary } from "@/lib/library";

type Props = {
  onSubmit?: (text: string) => void;
  onRespin?: () => void;
  initialValue?: string;
  placeholder?: string;
};

export default function PromptBar({ onSubmit, onRespin, initialValue = "", placeholder = "Type anything…" }: Props) {
  const [text, setText] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Build a short taste profile from Saved Library (titles only, capped)
  const taste = useMemo(() => {
    if (typeof window === "undefined") return [] as string[];
    const saved = loadLibrary();
    return saved.slice(0, 20).map(s => s.title).filter(Boolean);
  }, []);

  // Debounced fetch to /api/suggest whenever text changes (and on mount)
  useEffect(() => {
    const q = text.trim();
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: q, savedTitles: taste }),
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { suggestions } = await r.json();
        setSuggestions(Array.isArray(suggestions) ? suggestions : []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text, taste]);

  function submit(val?: string) {
    const value = (val ?? text).trim();
    if (!value) return;
    if (onSubmit) return onSubmit(value);
    // Default: emit global events for home page handler (keep your existing behavior)
    window.dispatchEvent(new CustomEvent("bloom:search", { detail: { q: value } }));
  }

  function respin() {
    if (onRespin) return onRespin();
    window.dispatchEvent(new CustomEvent("bloom:respin"));
  }

  return (
    <>
      {/* suggestions stack just above the bar */}
      <div className="fixed inset-x-0 bottom-[84px] z-40 pointer-events-none">
        <div className="mx-auto w-full max-w-[1400px] px-4">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={`${s}-${i}`}
                onClick={(e) => { e.preventDefault(); setText(s); }}
                className="pointer-events-auto px-3 py-1.5 rounded-full border text-sm bg-white hover:bg-slate-50"
                title={s}
              >
                {s}
              </button>
            ))}
            {loading && <div className="text-xs text-slate-400">thinking…</div>}
          </div>
        </div>
      </div>

      {/* bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-4 bg-white/80 backdrop-blur border-t">
          <div className="flex gap-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder={placeholder}
              className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <button onClick={() => submit()} className="px-4 py-3 rounded-xl bg-orange-500 text-white text-sm font-medium">
              Bloom it
            </button>
            <button onClick={respin} className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium">
              Respin
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
