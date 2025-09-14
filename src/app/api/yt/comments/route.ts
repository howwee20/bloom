import { NextResponse } from "next/server";
import { fetchTopCommentsBatch } from "@/lib/youtube/comments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.ENABLE_YT_COMMENTS === "0") {
    return NextResponse.json({}, { headers: { "cache-control": "no-store" } });
  }

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids") || "";
  // Accept up to 12 IDs per call (grid-sized chunk)
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!ids.length) {
    return NextResponse.json({}, { headers: { "cache-control": "no-store" } });
  }

  const map = await fetchTopCommentsBatch(ids, 3);
  // Allow CDN caching (responses vary per ids)
  return NextResponse.json(map, {
    headers: { "cache-control": "s-maxage=86400, stale-while-revalidate=43200" },
  });
}
