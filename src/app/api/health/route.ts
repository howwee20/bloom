import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const startedAt = Date.now();

async function probeOpenAI(key: string | undefined) {
  if (!key) {
    return { status: null, body: "No OPENAI_API_KEY" };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const status = res.status;
    try {
      return { status, body: await res.json() };
    } catch {
      return { status, body: await res.text() };
    }
  } catch (err) {
    return {
      status: -1,
      body: { error: (err as Error)?.message || String(err) },
    };
  }
}

async function probeYouTube(key: string | undefined) {
  if (!key) {
    return { status: null, body: "No YOUTUBE_API_KEY" };
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", "test");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    const status = res.status;
    try {
      return { status, body: await res.json() };
    } catch {
      return { status, body: await res.text() };
    }
  } catch (err) {
    return {
      status: -1,
      body: { error: (err as Error)?.message || String(err) },
    };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const adminKey = process.env.ADMIN_HEALTH_KEY;
  const providedKey = searchParams.get("key");
  const isAdmin = adminKey && providedKey === adminKey;

  const base = {
    status: "ok",
    uptime: Date.now() - startedAt,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  };

  if (!isAdmin) {
    return NextResponse.json(base);
  }

  const env = {
    OPENAI_API_KEY_present: !!process.env.OPENAI_API_KEY,
    YOUTUBE_API_KEY_present: !!process.env.YOUTUBE_API_KEY,
  };

  if (!searchParams.get("deep")) {
    return NextResponse.json({ ...base, env });
  }

  const [openaiProbe, youtubeProbe] = await Promise.all([
    probeOpenAI(process.env.OPENAI_API_KEY),
    probeYouTube(process.env.YOUTUBE_API_KEY),
  ]);

  return NextResponse.json({ ...base, env, openaiProbe, youtubeProbe });
}

