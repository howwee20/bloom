"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { loadLibrary } from "@/lib/library";

type Props = {
  // Optional overrides for page-specific actions
  onSubmit?: (text: string) => void;   // run a search (home)
  onRespin?: () => void;               // rotate deck (/saved or home)
  initialValue?: string;               // prefill input (e.g., ?q=iphone)
  initialSubmitted?: string;           // tells the bar what the last run was
  placeholder?: string;
};

export default function PromptBar({
  onSubmit,
  onRespin,
  initialValue = "",
  initialSubmitted = "",
  placeholder = "Describe what you want to watch…",
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [text, setText] = useState(initialValue || searchParams.get("q") || "");
  const lastSubmittedRef = useRef((initialSubmitted || searchParams.get("q") || "").trim());

  // --- Suggestions (simple, reliable; UI only—no extra logic here) ---
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const taste = useMemo(() => loadLibrary().slice(0, 20).map(s => s.title).filter(Boolean), []);

  useEffect(() => {
    const q = text.trim();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: q, savedTitles: taste }),
        });
        const j = await r.json().catch(() => ({ suggestions: [] }));
        const arr = Array.isArray(j.suggestions) ? j.suggestions : [];
        setSuggestions(arr);
      } catch {
        setSuggestions([]);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [text, taste]);

  // --- Dynamic label & single action ---
  const inSaved = pathname === "/saved";
  const trimmed = text.trim();
  const isNewPrompt = !inSaved && !!trimmed && trimmed.toLowerCase() !== lastSubmittedRef.current.toLowerCase();
  const buttonLabel = inSaved ? "Respin" : (isNewPrompt ? "Bloom it" : "Respin");

  function runSearch(value: string) {
    if (onSubmit) return onSubmit(value);
    window.dispatchEvent(new CustomEvent("bloom:search", { detail: { q: value } }));
  }
  function runRespin() {
    if (onRespin) return onRespin();
    window.dispatchEvent(new CustomEvent("bloom:respin"));
  }

  function doAction() {
    if (inSaved) return runRespin();
    if (isNewPrompt) {
      lastSubmittedRef.current = trimmed;
      return runSearch(trimmed);
    }
    return runRespin();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") doAction(); // ENTER mirrors the single button
  }

  return (
    <>
      {/* suggestion chips just above the bar */}
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
            {loading && <div className="pointer-events-auto text-xs text-slate-400">thinking…</div>}
          </div>
        </div>
      </div>

      {/* bottom bar with ONE action button */}
      <div className="fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-4 bg-white/80 backdrop-blur border-t">
          <div className="flex gap-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <button
              onClick={doAction}
              className="px-4 py-3 rounded-xl bg-orange-500 text-white text-sm font-medium"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

