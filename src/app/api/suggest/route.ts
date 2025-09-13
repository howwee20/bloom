import { NextRequest } from "next/server";
export const runtime = "edge";

type Body = { input?: string; savedTitles?: string[] };

function localSuggest(input: string, savedTitles: string[]): string[] {
  const base = [
    "deep dive interviews",
    "quiet train rides",
    "tech founders talks",
    "cinematic nature scenes",
    "history explainers",
    "chill jazz concert",
  ];
  const words = (savedTitles.join(" ") + " " + input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4);

  // crude keyword freq
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const top = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 6).map(([w])=>w);

  const themed = top.slice(0,3).flatMap(t => [
    `${t} best moments`,
    `${t} deep dive`,
  ]);

  const fromInput = input.trim()
    ? [
        `${input.trim()} documentary`,
        `${input.trim()} interviews`,
        `best of ${input.trim()}`,
      ]
    : [];

  const out = Array.from(new Set<string>([...fromInput, ...themed, ...base]));
  // keep 6, 4–8 words max-ish
  return out
    .map(s => s.replace(/\s+/g," ").trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function POST(req: NextRequest) {
  const { input = "", savedTitles = [] } = (await req.json().catch(()=>({}))) as Body;

  // attempt LLM with hard timeout; always fall back locally
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.INTENT_MODEL || "gpt-5-mini";

  async function llm(): Promise<string[]> {
    if (!apiKey) return [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500); // 1.5s hard cap
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content:
              `Return ONLY JSON: {"suggestions":["..."]}. 4–8 words each.
               If input is present, bias to it. Use 2–3 based on savedTitles. Keep safe.` },
            { role: "user", content: JSON.stringify({ input, savedTitles: savedTitles.slice(0,20) }) }
          ],
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) return [];
      const data = await r.json();
      const obj = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
      const arr = Array.isArray(obj.suggestions) ? obj.suggestions : [];
      return arr.slice(0, 6);
    } catch { return []; } finally { clearTimeout(timer); }
  }

  const modelOut = await llm();
  const final = (modelOut && modelOut.length > 0) ? modelOut : localSuggest(input, savedTitles);

  return Response.json({ suggestions: final });
}
