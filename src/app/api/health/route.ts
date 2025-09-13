import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_HEALTH_KEY;
  if (req.nextUrl.searchParams.get("key") !== adminKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
  const YT_KEY = process.env.YOUTUBE_API_KEY || "";
  const PSE_KEY = process.env.PSE_API_KEY || "";
  const PSE_CX = process.env.PSE_CX || "";

  const openaiPresent = !!OPENAI_KEY;
  const ytPresent = !!YT_KEY;
  const psePresent = !!PSE_KEY;
  const pseCxPresent = !!PSE_CX;

  let openaiStatus: number | null = null;
  let openaiBody: any = null;
  if (openaiPresent) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
      });
      openaiStatus = res.status;
      try {
        openaiBody = await res.json();
      } catch {
        openaiBody = await res.text();
      }
    } catch (err) {
      openaiStatus = -1;
      openaiBody = { error: (err as Error)?.message || String(err) };
    }
  }

  let ytStatus: number | null = null;
  let ytBody: any = null;
  if (ytPresent) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", "test");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "1");
      url.searchParams.set("key", YT_KEY);

      const res = await fetch(url.toString(), { method: "GET" });
      ytStatus = res.status;
      try {
        ytBody = await res.json();
      } catch {
        ytBody = await res.text();
      }
    } catch (err) {
      ytStatus = -1;
      ytBody = { error: (err as Error)?.message || String(err) };
    }
  }

  let pseStatus: number | null = null;
  let pseBody: any = null;
  if (psePresent && pseCxPresent) {
    try {
      const url = new URL(
        "https://customsearch.googleapis.com/customsearch/v1"
      );
      url.searchParams.set("q", "test");
      url.searchParams.set("key", PSE_KEY);
      url.searchParams.set("cx", PSE_CX);

      const res = await fetch(url.toString(), { method: "GET" });
      pseStatus = res.status;
      try {
        pseBody = await res.json();
      } catch {
        pseBody = await res.text();
      }
    } catch (err) {
      pseStatus = -1;
      pseBody = { error: (err as Error)?.message || String(err) };
    }
  }

  return NextResponse.json({
    env: {
      OPENAI_API_KEY_present: openaiPresent,
      YOUTUBE_API_KEY_present: ytPresent,
      PSE_API_KEY_present: psePresent,
      PSE_CX_present: pseCxPresent,
    },
    openaiProbe: openaiPresent
      ? { status: openaiStatus, body: openaiBody }
      : { status: null, body: "No OPENAI_API_KEY" },
    youtubeProbe: ytPresent
      ? { status: ytStatus, body: ytBody }
      : { status: null, body: "No YOUTUBE_API_KEY" },
    pseProbe: psePresent && pseCxPresent
      ? { status: pseStatus, body: pseBody }
      : { status: null, body: "No PSE_API_KEY or PSE_CX" },
  });
}

