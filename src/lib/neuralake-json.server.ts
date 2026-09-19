import { z } from "zod";
export function extractJson(content: string): unknown {
  const candidates: string[] = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{") {
      if (!depth) start = i;
      depth++;
    } else if (c === "}" && depth) {
      depth--;
      if (!depth) candidates.push(content.slice(start, i + 1));
    }
  }
  for (const value of candidates.reverse()) {
    try {
      return JSON.parse(value);
    } catch {}
  }
  throw new Error("A IA não retornou uma entrega estruturada. Tente novamente.");
}
export async function neuralakeJson(
  system: string,
  input: unknown,
  model = "reasoning",
  fetchImpl: typeof fetch = fetch,
) {
  const key = process.env["NEURALAKE_API_KEY"];
  if (!key) throw new Error("A NeuraLake ainda precisa ser configurada no servidor.");
  const started = Date.now();
  const response = await fetchImpl("https://api.neuralake.cloud/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(55000),
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 5000,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  if (!response.ok)
    throw new Error("A NeuraLake não concluiu a execução. Você pode tentar novamente.");
  const payload = await response.json();
  if (typeof payload?.choices?.[0]?.message?.content !== "string")
    throw new Error("A NeuraLake não devolveu conteúdo.");
  const usage = z
    .object({
      prompt_tokens: z.number().nonnegative().optional(),
      completion_tokens: z.number().nonnegative().optional(),
      total_tokens: z.number().nonnegative().optional(),
    })
    .safeParse(payload.usage);
  return {
    value: extractJson(payload.choices[0].message.content),
    durationMs: Date.now() - started,
    usage: usage.success ? usage.data : null,
  };
}
