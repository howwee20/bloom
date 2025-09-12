import OpenAI from "openai";

export const runtime = "edge";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  let prompt = "";
  let refine: "weirder" | "newer" | "longer" | undefined;
  try {
    const body = await req.json();
    if (typeof body.prompt === "string") prompt = body.prompt;
    if (body.refine === "weirder" || body.refine === "newer" || body.refine === "longer") {
      refine = body.refine;
    }
  } catch {}

  const userContent = refine ? `${prompt}\nRefine: ${refine}` : prompt;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You convert a messy user request into 2–3 concise YouTube search queries. Respond ONLY with JSON: {"queries":["..."]}.',
        },
        { role: "user", content: userContent },
      ],
    });

    let data: { queries: string[] };
    try {
      data = JSON.parse(completion.choices[0].message?.content ?? "");
      if (!Array.isArray(data.queries)) throw new Error("invalid");
    } catch {
      data = { queries: [prompt] };
    }

    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ queries: [prompt] }), {
      headers: { "content-type": "application/json" },
    });
  }
}

