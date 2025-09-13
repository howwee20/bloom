import { NextRequest } from "next/server";

export const runtime = "edge";

type Body = {
  input?: string;                 // current text in the prompt bar
  savedTitles?: string[];         // top N saved video titles (client-provided)
};

export async function POST(req: NextRequest) {
  try {
    const { input = "", savedTitles = [] } = (await req.json()) as Body;

    // Basic in-memory cache (edge process lifetime)
    const key = JSON.stringify({ i: input.trim().toLowerCase(), s: savedTitles.slice(0, 12) });
    // @ts-ignore
    globalThis.__SUGGEST ||= new Map<string, { ts: number; val: string[] }>();
    // @ts-ignore
    const cache: Map<string, { ts: number; val: string[] }> = globalThis.__SUGGEST;
    const now = Date.now();
    const TTL = 10 * 60 * 1000; // 10m
    const hit = cache.get(key);
    if (hit && now - hit.ts < TTL) {
      return Response.json({ suggestions: hit.val.slice(0, 6), cached: true });
    }

    const system = `You produce short, clickable prompt ideas for a video discovery app.
Return ONLY JSON of the form: {"suggestions":["..."]}.
Guidelines:
- 4–8 words each, no punctuation at the end, no quotes.
- Diverse but coherent; avoid duplicates.
- If "input" is non-empty, bias suggestions to be natural next-steps for that input.
- If "savedTitles" are provided, infer the user's tastes and include 2–3 that reflect them.
- Keep them safe and generic; don't include offensive/NSFW content.`;

    const user = JSON.stringify({ input, savedTitles: savedTitles.slice(0, 20) });

    const model = process.env.INTENT_MODEL || "gpt-5-mini";
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return new Response("OPENAI_API_KEY missing", { status: 500 });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
      }),
    });

    if (!r.ok) return new Response(await r.text(), { status: r.status });

    const data = await r.json();
    let parsed: string[] = [];
    try {
      const obj = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      parsed = Array.isArray(obj.suggestions) ? obj.suggestions : [];
    } catch {
      parsed = [];
    }
    // Fallbacks if model returns nothing
    if (parsed.length === 0) {
      parsed = [
        "deep dive interviews",
        "quiet train rides",
        "tech founders talks",
        "cinematic nature scenes",
        "history explainers",
        "chill jazz concert"
      ];
    }

    cache.set(key, { ts: now, val: parsed });
    return Response.json({ suggestions: parsed.slice(0, 6) });
  } catch (e: any) {
    return new Response(`suggest error: ${e?.message || "unknown"}`, { status: 500 });
  }
}
