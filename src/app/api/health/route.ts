import { NextRequest, NextResponse } from "next/server";
import { getRollingCounts } from "@/lib/counters";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const OPENAI = !!process.env.OPENAI_API_KEY;
  const YT = process.env.YOUTUBE_API_KEY || "";
  const ytPresent = !!YT;

  let ytStatus: number | null = null;
  let ytBody: any = null;

  if (ytPresent) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", "test");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "1");
      url.searchParams.set("key", YT);

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

  const adminKey = process.env.ADMIN_KEY;
  let counters: any = null;
  if (adminKey) {
    const provided =
      req.headers.get("x-admin-key") ||
      req.nextUrl.searchParams.get("key") ||
      "";
    if (provided === adminKey) {
      counters = getRollingCounts();
    }
  }

  return NextResponse.json({
    env: {
      OPENAI_API_KEY_present: OPENAI,
      YOUTUBE_API_KEY_present: ytPresent,
    },
    youtubeProbe: ytPresent
      ? { status: ytStatus, body: ytBody }
      : { status: null, body: "No YOUTUBE_API_KEY" },
    ...(counters ? { counters } : {}),
  });
}

