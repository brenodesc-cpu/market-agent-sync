import type { AgentDefinition } from "./agent-definition";
import type { AgentOffer } from "./a2a-contract";

const stopWords = new Set([
  "para",
  "com",
  "uma",
  "que",
  "das",
  "dos",
  "por",
  "seu",
  "sua",
  "este",
  "esta",
  "crie",
  "faca",
]);

function words(value: string) {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((word) => word.length >= 3 && !stopWords.has(word)) ?? [],
  );
}

function overlap(left: string, right: string) {
  const requested = words(left);
  let score = 0;
  for (const word of words(right)) if (requested.has(word)) score++;
  return score;
}

function categoryFor(task: string): AgentDefinition["category"] {
  const value = task
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\b(codigo|program|html|css|api|site|software|app)\b/.test(value)) return "Desenvolvimento";
  if (/\b(proposta|venda|cliente|comercial)\b/.test(value)) return "Vendas";
  if (/\b(marketing|campanha|anuncio|marca)\b/.test(value)) return "Marketing";
  if (/\b(conteudo|roteiro|post|video|instagram|texto)\b/.test(value)) return "Conteúdo";
  if (/\b(analise|pesquisa|diagnostico|dados)\b/.test(value)) return "Análise";
  if (/\b(operacao|processo|automacao|financeiro)\b/.test(value)) return "Operações";
  return "Outro";
}

export function fallbackMissionPlan(
  task: string,
  budget: number,
  own: AgentDefinition | null,
  offers: AgentOffer[],
) {
  const category = categoryFor(task);
  const candidates = offers
    .filter((offer) => offer.price <= budget)
    .map((offer) => ({
      offer,
      relevance: overlap(
        `${task} ${category}`,
        `${offer.title} ${offer.description} ${offer.category ?? ""} ${offer.exampleTask ?? ""}`,
      ),
    }))
    .filter(({ relevance }) => relevance > 0)
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        left.offer.price - right.offer.price ||
        left.offer.id.localeCompare(right.offer.id),
    );
  const candidate = candidates[0]?.offer;
  const ownRelevance = own
    ? overlap(task, `${own.name} ${own.description} ${own.serviceTitle} ${own.category}`)
    : 0;
  const action = candidate ? "network" : own && ownRelevance > 0 ? "internal" : "create";
  const role =
    action === "network" && candidate
      ? candidate.title
      : action === "internal" && own
        ? own.name
        : `Especialista de ${category}`;
  const externalActions = /\b(publicar|postar|enviar|acessar|abrir)\b/i.test(task)
    ? ["Conector externo solicitado no briefing"]
    : [];
  return {
    summary: `${role} executará a entrega solicitada e enviará o resultado para verificação.`,
    blockedTools: externalActions,
    steps: [
      {
        role,
        objective: task.slice(0, 1200),
        category,
        instructions:
          "Use somente o briefing recebido. Produza uma entrega completa, indique premissas e não afirme ter executado ferramentas externas.",
        sections: ["Entrega", "Premissas e próximos passos"],
        model: category === "Desenvolvimento" ? "code" : "text",
        action,
        offerVersionId: candidate?.id ?? null,
        reason: candidate
          ? `Oferta compatível encontrada por especialidade, escopo e preço dentro do orçamento de ${budget} créditos.`
          : action === "internal"
            ? "A capacidade da empresa é compatível com a solicitação."
            : "Nenhuma oferta compatível foi encontrada; a rede criará um especialista para esta entrega.",
      },
    ],
  } as const;
}
