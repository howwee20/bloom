"use client";
import { useState } from "react";

type Props = {
  onSubmit?: (text: string) => void;
  onRespin?: () => void;
  initialValue?: string;
  placeholder?: string;
};

export default function PromptBar({ onSubmit, onRespin, initialValue = "", placeholder = "Type anything…" }: Props) {
  const [text, setText] = useState(initialValue);

  function submit() {
    const q = text.trim();
    if (!q) return;
    if (onSubmit) return onSubmit(q);
    // DEFAULT: let existing home behavior run (dispatch your /api/search)
    // You likely already had this logic — keep it here:
    window.dispatchEvent(new CustomEvent("bloom:search", { detail: { q } }));
  }

  function respin() {
    if (onRespin) return onRespin();
    // DEFAULT: home "Respin" behavior (emit event or call your handler)
    window.dispatchEvent(new CustomEvent("bloom:respin"));
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 bg-white/80 backdrop-blur border-t">
        <div className="flex gap-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={placeholder}
            className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />
          <button
            onClick={respin}
            className="px-4 py-3 rounded-xl bg-orange-500 text-white text-sm font-medium"
          >
            Respin
          </button>
        </div>
      </div>
    </div>
  );
}

