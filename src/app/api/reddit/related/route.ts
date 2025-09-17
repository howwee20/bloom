import { NextResponse } from "next/server";
import { redditPseSearch, type RedditPseResult } from "@/lib/reddit/pse";

export const runtime = "edge";

interface RedditLink {
  title: string;
  url: string;
  subreddit?: string;
  image?: string | null;
}

interface Body {
  topics?: unknown;
  limit?: unknown;
}

const CACHE_CONTROL = "s-maxage=120, stale-while-revalidate=300";

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\[\](){}]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSubreddit(url: string, displayLink?: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const rIndex = parts.findIndex((p) => p.toLowerCase() === "r");
    if (rIndex !== -1 && parts.length > rIndex + 1) {
      return `r/${parts[rIndex + 1]}`;
    }
  } catch {}
  if (displayLink && /reddit\.com\/r\//i.test(displayLink)) {
    const match = displayLink.match(/r\/[^/]+/i);
    if (match) return match[0];
  }
  return undefined;
}

function tokenizeTopics(topics: string[]): string[] {
  const tokens = new Set<string>();
  for (const topic of topics) {
    for (const word of topic.split(/[^A-Za-z0-9+]+/)) {
      const trimmed = word.trim().toLowerCase();
      if (trimmed.length <= 2) continue;
      tokens.add(trimmed);
    }
  }
  return Array.from(tokens);
}

function scoreResult(result: RedditPseResult, topicTokens: string[]): number {
  let score = 0;
  const title = result.title.toLowerCase();
  for (const token of topicTokens) {
    if (token && title.includes(token)) {
      score += 2;
    }
  }
  const subreddit = extractSubreddit(result.url, result.displayLink);
  if (subreddit) {
    score += 1.5;
  }
  return score;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const topics = Array.isArray(body?.topics)
    ? body.topics.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  const limitRaw = typeof body?.limit === "number" ? body.limit : undefined;
  const limit = Math.min(Math.max(limitRaw ?? 4, 1), 4);

  if (!topics.length) {
    return NextResponse.json<RedditLink[]>([], {
      headers: { "cache-control": CACHE_CONTROL },
    });
  }

  const selectedTopics = topics.slice(0, 2);
  const quoted = selectedTopics
    .map((topic) => topic.trim())
    .filter(Boolean)
    .map((topic) => (topic.includes(" ") ? `"${topic}"` : topic));
  const queryTopic = quoted.join(" OR ");
  const query = queryTopic ? `${queryTopic}` : selectedTopics[0];

  const results = await redditPseSearch(query, 6);
  if (!results.length) {
    return NextResponse.json<RedditLink[]>([], {
      headers: { "cache-control": CACHE_CONTROL },
    });
  }

  const topicTokens = tokenizeTopics(selectedTopics);
  const seen = new Set<string>();
  const ranked: { item: RedditPseResult; score: number }[] = [];

  for (const item of results) {
    const normTitle = normalizeTitle(item.title);
    if (!normTitle || seen.has(normTitle)) continue;
    seen.add(normTitle);
    const score = scoreResult(item, topicTokens);
    ranked.push({ item, score });
  }

  ranked.sort((a, b) => b.score - a.score);

  const payload: RedditLink[] = [];
  for (const { item } of ranked) {
    const subreddit = extractSubreddit(item.url, item.displayLink);
    payload.push({
      title: item.title,
      url: item.url,
      subreddit: subreddit,
      image: item.image ?? null,
    });
    if (payload.length >= limit) break;
  }

  return NextResponse.json(payload, {
    headers: { "cache-control": CACHE_CONTROL },
  });
}
