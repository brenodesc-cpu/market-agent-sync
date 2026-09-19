import { z } from "zod";

export const AGENT_CAPABILITY = "agent.task.v1";
export const agentDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().min(10).max(1000),
  serviceTitle: z.string().trim().min(4).max(100),
  category: z.enum([
    "Marketing",
    "Vendas",
    "Operações",
    "Conteúdo",
    "Desenvolvimento",
    "Análise",
    "Outro",
  ]),
  instructions: z.string().trim().min(30).max(8000),
  knowledge: z.string().max(16000).default(""),
  sections: z
    .array(z.string().trim().min(2).max(90))
    .min(1)
    .max(8)
    .refine((v) => new Set(v).size === v.length, "Use nomes de seções diferentes."),
  exampleTask: z.string().trim().min(10).max(3000),
  model: z.enum(["text", "reasoning", "code"]).default("reasoning"),
  price: z.number().int().min(1).max(1000).default(15),
  visibility: z.enum(["private", "commercial"]).default("private"),
  capability: z.literal(AGENT_CAPABILITY).default(AGENT_CAPABILITY),
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export function parseGeneratedDefinition(
  value: unknown,
  visibility: "private" | "commercial" = "private",
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return agentDefinitionSchema.parse(value);
  const candidate = value as Record<string, unknown>;
  const knowledge = candidate["knowledge"];
  return agentDefinitionSchema.parse({
    ...candidate,
    visibility,
    knowledge:
      knowledge == null
        ? ""
        : Array.isArray(knowledge) && knowledge.every((v) => typeof v === "string")
          ? knowledge.join("\n")
          : knowledge,
  });
}

export const executionIdentity = (spec: AgentDefinition) =>
  JSON.stringify({
    instructions: spec.instructions,
    knowledge: spec.knowledge,
    sections: spec.sections,
    model: spec.model,
  });
export const agentResultSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    sections: z
      .array(
        z
          .object({
            heading: z.string().trim().min(2).max(90),
            content: z.string().trim().min(1).max(30000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    artifacts: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-zA-Z0-9_-]+\.(html|md|txt|json|js|ts|py|css)$/),
            mediaType: z.enum(["text/html", "text/plain", "text/markdown", "application/json"]),
            content: z.string().min(10).max(60000),
          })
          .strict(),
      )
      .max(5)
      .default([]),
  })
  .strict();
export type AgentResult = z.infer<typeof agentResultSchema>;
export function agentCriteria(sections: string[]) {
  return [
    { criterion: "Formato da entrega", expected: "agent.result.v1" },
    { criterion: "Seções combinadas", expected: JSON.stringify(sections) },
    { criterion: "Conteúdo preenchido", expected: true },
  ];
}
export function verifyAgentResult(sections: string[], content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }
  const result = agentResultSchema.safeParse(parsed);
  const headings = result.success ? result.data.sections.map((s) => s.heading) : [];
  const matching =
    headings.length === sections.length && headings.every((h, i) => h === sections[i]);
  const checks = agentCriteria(sections).map((c, i) => {
    const passed =
      i === 1
        ? result.success && matching
        : result.success && new TextEncoder().encode(content).length <= 262144;
    return {
      ...c,
      observed:
        i === 0
          ? result.success
            ? "agent.result.v1"
            : "Formato inválido"
          : i === 1
            ? JSON.stringify(headings)
            : passed,
      status: passed ? ("passed" as const) : ("failed" as const),
      evidence:
        i === 1
          ? `Esperadas: ${sections.join(", ")}. Recebidas: ${headings.join(", ") || "nenhuma"}.`
          : i === 0
            ? "Leitura do JSON efetivamente entregue e dos tipos de cada campo."
            : "Tamanho e presença de conteúdo conferidos. Qualidade e correção factual dependem do aceite humano.",
    };
  });
  return {
    checks,
    decision: checks.every((c) => c.status === "passed")
      ? ("approved" as const)
      : ("rejected" as const),
    summary: checks.every((c) => c.status === "passed")
      ? "A entrega tem o formato e as seções combinadas. Confira o conteúdo antes de aprovar o pagamento."
      : "A entrega não cumpriu a estrutura combinada. O pagamento permanece bloqueado.",
  };
}
export const AGENT_EXAMPLES = [
  "Crie um agente que escreva propostas comerciais para uma agência de marketing.",
  "Crie um agente de conteúdo que transforme um briefing em roteiros de vídeos curtos.",
  "Crie um agente desenvolvedor que entregue uma landing page em HTML e CSS.",
  "Crie um agente que analise entrevistas com clientes e identifique necessidades recorrentes.",
];
