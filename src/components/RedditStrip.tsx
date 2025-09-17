"use client";

import { useEffect, useMemo, useState } from "react";

type RedditLink = {
  title: string;
  url: string;
  subreddit?: string;
  image?: string | null;
};

interface Props {
  topics: string[];
}

export default function RedditStrip({ topics }: Props) {
  const [links, setLinks] = useState<RedditLink[] | null>(null);

  const payload = useMemo(() => {
    const cleaned = Array.isArray(topics)
      ? topics
          .map((t) => t.trim())
          .filter((t, idx, arr) => t.length > 0 && arr.indexOf(t) === idx)
      : [];
    return cleaned.slice(0, 4);
  }, [topics]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!payload.length) {
        setLinks([]);
        return;
      }
      try {
        const res = await fetch("/api/reddit/related", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topics: payload, limit: 4 }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setLinks(data as RedditLink[]);
        }
      } catch {
        if (!cancelled) setLinks([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (!payload.length || !links || links.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <div className="mb-2 text-xs uppercase tracking-wide text-black/50">
        Related on Reddit
      </div>
      <div className="flex flex-wrap gap-3">
        {links.slice(0, 4).map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-start gap-2 rounded-lg border border-black/10 bg-white p-2 shadow-sm transition hover:border-black/20 hover:shadow"
          >
            {link.image ? (
              <img
                src={link.image}
                alt=""
                className="h-10 w-10 flex-shrink-0 rounded object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-black">
                {link.title}
              </div>
              {link.subreddit ? (
                <div className="text-xs text-black/60">{link.subreddit}</div>
              ) : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
