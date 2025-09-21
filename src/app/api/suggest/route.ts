import { NextRequest } from "next/server";
export const runtime = "edge";

type Body = { input?: string };

const WILDCARDS = [
  "underrated interviews worth watching",
  "cinematic nature scenes to relax",
  "quiet japanese train rides",
  "founder origin stories",
  "deep history explainers",
  "live jazz performances",
  "learn something new today",
  "best longform conversations",
];

function sanitize(s: string) {
  return s.replace(/\s+/g, " ").replace(/[^\w\s\-&:]/g, "").trim();
}
function short(s: string, max = 60) {
  s = sanitize(s);
  return s.length <= max ? s : s.slice(0, max - 1);
}
function pickRandom<T>(arr: T[], fallback: T): T {
  if (!arr?.length) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}
function keywordsFrom(title: string): string[] {
  const t = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = t.split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));
  const uniq = Array.from(new Set(words));
  return uniq.slice(0, 6);
}
const STOP = new Set([
  "video","official","channel","review","highlights","episode","podcast",
  "interview","youtube","watch","full","best","new","2024","2025"
]);

function localJourney(seedTitle: string, input: string): string[] {
  const seed = sanitize(seedTitle);
  const seedKw = keywordsFrom(seed);
  const inText = sanitize(input);

  // 1) Personal variant (tight)
  const p1 = seed ? short(`${seed} best moments`) : "";

  // 2–3) Associative (from seed keywords)
  const assocBase = seedKw.length ? seedKw : (seed ? seed.split(" ") : []);
  const a1 = assocBase[0] ? short(`${assocBase[0]} deep dive`) : "";
  const a2 = assocBase[1] ? short(`${assocBase[1]} explained`) : "";

  // 4–5) Exploratory (step out a ring)
  const e1 = assocBase[2] ? short(`history of ${assocBase[2]}`) : short("timeless interviews");
  const e2 = assocBase[3] ? short(`${assocBase[3]} documentary`) : short("learn something new");

  // 6) Wildcard (fully serendipitous)
  const w1 = pickRandom(WILDCARDS, "surprising longform picks");

  let out = [p1, a1, a2, e1, e2, w1].filter(Boolean);

  // If user is typing, bias to input: ensure 2 spots reflect their text
  if (inText) {
    const bias1 = short(`${inText} deep dive`);
    const bias2 = short(`best of ${inText}`);
    // replace positions 2 and 3 to keep left→right arc
    out[1] = bias1;
    out[2] = bias2;
  }

  // dedupe + clamp + ensure 6 with wildcards
  out = Array.from(new Set(out)).slice(0, 6);
  while (out.length < 6) out.push(pickRandom(WILDCARDS, "watch something new"));
  return out.slice(0, 6);
}

async function llmJourney(apiKey: string, model: string, seedTitle: string, input: string): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500); // 1.5s hard cap
  try {
    const system = `Return ONLY JSON: {"suggestions":["...", "...", "...", "...", "...", "..."]}.
6 items total. 4–8 words each. No quotes, no trailing punctuation.
Left→right arc:
1) personal variant of the seed title,
2–3) associative riffs,
4–5) exploratory but adjacent,
6) wildcard serendipity.
If input is non-empty, 2 of the items must clearly reflect it. Keep safe.`;
    const user = JSON.stringify({ seedTitle, input });

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
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const data = await r.json();
    const obj = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const arr: string[] = Array.isArray(obj?.suggestions) ? obj.suggestions : [];
    return arr.map(s => short(String(s))).filter(Boolean).slice(0, 6);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const { input = "" } = (await req.json().catch(() => ({}))) as Body;

  // choose one random wildcard as a loose seed when none supplied
  const seedTitle = pickRandom(WILDCARDS, "");

  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.INTENT_MODEL || "gpt-5-mini";

  // Try LLM; always fall back locally to guarantee chips
  const llm = apiKey ? await llmJourney(apiKey, model, seedTitle, input) : [];
  const local = localJourney(seedTitle, input);
  const final = (llm.length === 6 ? llm : local);

  return Response.json({ suggestions: final });
}

