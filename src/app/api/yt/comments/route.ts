import { NextResponse } from "next/server";
import { fetchTopCommentsBatch } from "@/lib/youtube/comments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.ENABLE_YT_COMMENTS === "0") {
    return NextResponse.json({}, { headers: { "cache-control": "no-store" } });
  }

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids") || "";
  const maxParam = url.searchParams.get("max") || "";
  const parsedMax = Number.parseInt(maxParam, 10);
  const max = Number.isFinite(parsedMax)
    ? Math.min(10, Math.max(1, parsedMax))
    : 8;

  const ids = Array.from(
    new Set(
      idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);

  if (!ids.length) {
    return NextResponse.json({}, { headers: { "cache-control": "no-store" } });
  }

  try {
    const map = await fetchTopCommentsBatch(ids, { max });
    return NextResponse.json(map, {
      headers: { "cache-control": "s-maxage=86400, stale-while-revalidate=43200" },
    });
  } catch {
    return NextResponse.json({}, { headers: { "cache-control": "no-store" } });
  }
}
