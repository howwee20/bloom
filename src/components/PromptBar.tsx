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
  const [busy, setBusy] = useState(false);

  // GLOBAL ENTER: trigger the same action as the single button from anywhere
  useEffect(() => {
    function onGlobalEnter(e: KeyboardEvent) {
      // Only plain Enter (no modifiers), ignore auto-repeat, and ignore while busy
      if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (busy) return;
      // Prevent default browser behavior (e.g., submitting forms)
      e.preventDefault();
      // Run the unified action (Bloom it / Respin, or Saved rotate)
      doAction();
    }
    window.addEventListener("keydown", onGlobalEnter, { capture: true });
    return () => window.removeEventListener("keydown", onGlobalEnter, { capture: true } as any);
  }, [busy]); // doAction is stable in this component's closure

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

  // Busy reset on "done" events (from pages)
  useEffect(() => {
    function onDone() { stopBusy(); }
    window.addEventListener("bloom:done", onDone);
    return () => window.removeEventListener("bloom:done", onDone);
  }, []);

  // Safety timeout: never get stuck busy (8s cap)
  const busyTimer = useRef<number | null>(null);
  function startBusy() {
    setBusy(true);
    if (busyTimer.current) window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => setBusy(false), 8000);
  }
  function stopBusy() {
    setBusy(false);
    if (busyTimer.current) { window.clearTimeout(busyTimer.current); busyTimer.current = null; }
  }

  // --- Dynamic label & single action ---
  const inSaved = pathname === "/saved";
  const trimmed = text.trim();
  const isNewPrompt = !inSaved && !!trimmed && trimmed.toLowerCase() !== lastSubmittedRef.current.toLowerCase();
  const baseLabel = inSaved ? "Respin" : (isNewPrompt ? "Bloom it" : "Respin");
  const buttonLabel = busy ? "Searching…" : baseLabel;

  function runSearch(value: string) {
    if (onSubmit) return onSubmit(value);
    window.dispatchEvent(new CustomEvent("bloom:search", { detail: { q: value } }));
  }
  function runRespin() {
    if (onRespin) return onRespin();
    window.dispatchEvent(new CustomEvent("bloom:respin"));
  }

  function doAction() {
    if (busy) return;
    startBusy();
    if (inSaved) {
      // page-level onRespin will fire and then dispatch 'bloom:done'
      return runRespin();
    }
    if (isNewPrompt) {
      lastSubmittedRef.current = trimmed;
      return runSearch(trimmed); // page will dispatch 'bloom:done' on completion
    }
    return runRespin();
  }

  // Input-specific handler; stop bubbling so global listener doesn't double-run
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Stop bubbling so the global listener doesn't double-run when focused in the input
    e.stopPropagation();
    if (e.key === "Enter" && !busy) {
      e.preventDefault();
      doAction();
    }
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
              onKeyDown={onInputKeyDown}
              placeholder={placeholder}
              className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              disabled={busy}
            />
            <button
              onClick={doAction}
              disabled={busy}
              aria-busy={busy ? "true" : "false"}
              className="px-4 py-3 rounded-xl bg-blue-500 text-white text-sm font-medium disabled:opacity-60"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

