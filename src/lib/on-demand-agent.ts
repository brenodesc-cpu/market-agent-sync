import { AGENT_CAPABILITY, agentDefinitionSchema } from "./agent-definition.ts";
import type { AgentDefinition } from "./agent-definition.ts";

export function createOnDemandAgentDefinition(
  input: Pick<AgentDefinition, "category" | "instructions" | "model">,
  availableBudget: number,
) {
  if (!Number.isInteger(availableBudget) || availableBudget < 1)
    throw new Error("O orçamento restante não permite contratar outro agente.");
  return agentDefinitionSchema.parse({
    name: `Especialista de ${input.category}`,
    description: `Especialista sob demanda em ${input.category}. Produz entregas estruturadas a partir do briefing privado do comprador.`,
    serviceTitle: `Serviço de ${input.category}`,
    category: input.category,
    instructions: input.instructions,
    knowledge: "",
    sections: ["Análise do briefing", "Entrega final"],
    exampleTask: "Analise o briefing privado recebido e produza a entrega estruturada solicitada.",
    model: input.model,
    price: Math.max(1, Math.min(15, availableBudget)),
    visibility: "commercial",
    capability: AGENT_CAPABILITY,
  });
}
