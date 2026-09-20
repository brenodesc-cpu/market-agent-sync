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

export function missionCapability(task: string) {
  const value = task
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const webArtifact = /\b(landing(?:\s+page)?|pagina\s+web|website|frontend|html|css|site)\b/.test(
    value,
  );
  const category: AgentDefinition["category"] =
    webArtifact || /\b(codigo|program|api|software|app)\b/.test(value)
      ? "Desenvolvimento"
      : /\b(proposta|venda|cliente|comercial)\b/.test(value)
        ? "Vendas"
        : /\b(marketing|campanha|anuncio|marca)\b/.test(value)
          ? "Marketing"
          : /\b(conteudo|roteiro|post|video|instagram|texto)\b/.test(value)
            ? "Conteúdo"
            : /\b(analise|pesquisa|diagnostico|dados)\b/.test(value)
              ? "Análise"
              : /\b(operacao|processo|automacao|financeiro)\b/.test(value)
                ? "Operações"
                : "Outro";
  return {
    category,
    model: category === "Desenvolvimento" ? "code" : "text",
    webArtifact,
  } as const;
}

export function agentMatchesMission(
  task: string,
  agent: {
    category?: string;
    name?: string;
    description?: string;
    serviceTitle?: string;
    exampleTask?: string;
  },
) {
  const requirement = missionCapability(task);
  if (requirement.category === "Outro") return true;
  if (agent.category?.localeCompare(requirement.category, undefined, { sensitivity: "base" }) === 0)
    return true;
  if (!requirement.webArtifact) return false;
  return /\b(landing(?:\s+page)?|pagina\s+web|website|frontend|html|css|site)\b/.test(
    `${agent.name ?? ""} ${agent.description ?? ""} ${agent.serviceTitle ?? ""} ${agent.exampleTask ?? ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
  );
}

export function planMatchesMission(
  task: string,
  steps: Array<{ category: AgentDefinition["category"]; model: AgentDefinition["model"] }>,
) {
  const requirement = missionCapability(task);
  if (!requirement.webArtifact) return true;
  const finalStep = steps.at(-1);
  return finalStep?.category === "Desenvolvimento" && finalStep.model === "code";
}

export function fallbackMissionPlan(
  task: string,
  budget: number,
  own: AgentDefinition | null,
  offers: AgentOffer[],
) {
  const requirement = missionCapability(task);
  const category = requirement.category;
  const candidates = offers
    .filter((offer) => offer.price <= budget && agentMatchesMission(task, offer))
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
  const ownRelevance =
    own && agentMatchesMission(task, own)
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
        instructions: requirement.webArtifact
          ? "Use somente o briefing recebido. Produza uma landing page funcional e entregue o arquivo HTML completo em artifacts. Inclua o CSS necessário e não afirme ter publicado o site."
          : "Use somente o briefing recebido. Produza uma entrega completa, indique premissas e não afirme ter executado ferramentas externas.",
        sections: ["Entrega", "Premissas e próximos passos"],
        model: requirement.model,
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
