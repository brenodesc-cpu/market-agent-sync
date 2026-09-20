import { z } from "zod";
import { readResponseBytes } from "./bounded-response.mjs";
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
    } catch {
      // A reasoning preamble may contain a JSON-like object; try the prior candidate.
    }
  }
  throw new Error("A IA não retornou uma entrega estruturada. Tente novamente.");
}
// All retries within one operation share the same deadline.
export function createInferenceBudget(
  timeoutMs = 22000,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  const deadline = AbortSignal.timeout(timeoutMs);
  return (input, init) => {
    deadline.throwIfAborted();
    return fetchImpl(input, {
      ...init,
      signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]),
    });
  };
}
export async function neuralakeJson(
  system: string,
  input: unknown,
  model = "reasoning",
  fetchImpl: typeof fetch = fetch,
  maxTokens = 3500,
) {
  const key = process.env["NEURALAKE_API_KEY"];
  if (!key) throw new Error("A NeuraLake ainda precisa ser configurada no servidor.");
  const started = Date.now();
  let response: Response;
  try {
    response = await fetchImpl("https://api.neuralake.cloud/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Lovable encerra funções públicas antes de 30 s. Falhe com uma mensagem
      // recuperável em vez de deixar o navegador receber um "Failed to fetch".
      signal: AbortSignal.timeout(22000),
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
  } catch {
    throw new Error(
      "A NeuraLake demorou para responder ou a conexão foi interrompida. Tente novamente.",
    );
  }
  if (!response.ok)
    throw new Error("A NeuraLake não concluiu a execução. Você pode tentar novamente.");
  const bytes = await readResponseBytes(response, 1048576);
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  const choice = payload?.choices?.[0];
  if (
    (choice?.finish_reason != null && choice.finish_reason !== "stop") ||
    choice?.message?.tool_calls?.length ||
    choice?.message?.refusal
  )
    throw new Error(
      "A NeuraLake devolveu uma resposta incompleta ou incompatível. Tente novamente.",
    );
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
    resolvedModel: typeof payload.model === "string" ? payload.model : null,
    durationMs: Date.now() - started,
    usage: usage.success ? usage.data : null,
  };
}
