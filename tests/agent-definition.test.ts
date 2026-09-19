import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentDefinitionSchema,
  executionIdentity,
  verifyAgentResult,
  agentResultSchema,
  parseGeneratedDefinition,
  normalizeAgentResult,
} from "../src/lib/agent-definition.ts";
import { orderRequestSchema } from "../src/lib/a2a-contract.ts";
import { extractJson, neuralakeJson } from "../src/lib/neuralake-json.server.ts";
import { resolveMissionRoute } from "../src/lib/mission-router.ts";
import {
  historicalReputation,
  selectAuctionWinner,
  shortlistAuctionCandidates,
} from "../src/lib/agent-auction.ts";
import type { AgentOffer } from "../src/lib/a2a-contract.ts";
import { createOnDemandAgentDefinition } from "../src/lib/on-demand-agent.ts";
import {
  allocateMissionStepBudgets,
  MAX_MISSION_STEPS,
  missionStatusAfterDelivery,
  requireUntouchedMissionDescendants,
} from "../src/lib/mission-budget.ts";
const spec = agentDefinitionSchema.parse({
  name: "Propostas",
  description: "Escreve propostas comerciais completas.",
  serviceTitle: "Proposta comercial",
  category: "Vendas",
  instructions: "Escreva propostas baseadas nos dados do cliente e indique todas as hipóteses.",
  sections: ["Briefing, objetivo", "Proposta"],
  exampleTask: "Uma proposta para uma loja de roupas",
});
const output = {
  title: "Proposta para loja",
  sections: spec.sections.map((heading) => ({
    heading,
    content: "Conteúdo preparado com os dados fornecidos.",
  })),
  artifacts: [],
};
test("arbitrary specialists require unique delivery sections and preserve execution identity across commercial edits", () => {
  assert.equal(
    executionIdentity(spec),
    executionIdentity({ ...spec, price: 30, visibility: "commercial", name: "Nome novo" }),
  );
  assert.notEqual(
    executionIdentity(spec),
    executionIdentity({ ...spec, knowledge: "Nova referência" }),
  );
  assert.equal(
    agentDefinitionSchema.safeParse({ ...spec, sections: ["Igual", "Igual"] }).success,
    false,
  );
});
test("verifier checks actual JSON and exact contracted sections without promising content quality", () => {
  const report = verifyAgentResult(spec.sections, JSON.stringify(output));
  assert.equal(report.decision, "approved");
  assert.equal(report.checks[1]?.expected, JSON.stringify(spec.sections));
  assert.match(report.summary, /antes de aprovar/);
  for (const invalid of [
    "not json",
    JSON.stringify({ ...output, sections: output.sections.slice(1) }),
    JSON.stringify({ ...output, sections: [...output.sections].reverse() }),
    JSON.stringify({ ...output, sections: [{ heading: spec.sections[0], content: "" }] }),
  ])
    assert.equal(verifyAgentResult(spec.sections, invalid).decision, "rejected");
  assert.equal(
    agentResultSchema.safeParse({
      ...output,
      artifacts: [
        { name: "../../attack.html", mediaType: "text/html", content: "<h1>Example</h1>" },
      ],
    }).success,
    false,
  );
});
test("A2A accepts a task or legacy rows, never both or neither", () => {
  const base = {
    requestId: crypto.randomUUID(),
    buyerCompanyId: crypto.randomUUID(),
    title: "Pedido especialista",
    budget: 30,
  };
  assert.equal(
    orderRequestSchema.safeParse({ ...base, task: "Faça uma proposta comercial" }).success,
    true,
  );
  assert.equal(orderRequestSchema.safeParse(base).success, false);
  assert.equal(
    orderRequestSchema.safeParse({
      ...base,
      task: "Faça uma proposta comercial",
      rows: [{ sku: "X", size: "M", priceCents: 20 }],
    }).success,
    false,
  );
});
test("NeuraLake JSON parser preserves code and rejects truncated provider output", () => {
  const payload = { title: 'Página com "aspas"', html: "<style>body{color:red}</style>" };
  assert.deepEqual(extractJson("```json\n" + JSON.stringify(payload) + "\n```"), payload);
  assert.throws(() => extractJson('{"title":"truncado'), /estruturada/);
});
test("provider errors never turn into fabricated successful work", async () => {
  const previous = process.env.NEURALAKE_API_KEY;
  process.env.NEURALAKE_API_KEY = "test-only";
  try {
    await assert.rejects(
      () =>
        neuralakeJson("s", {}, "reasoning", async () => {
          throw new Error("timeout");
        }),
      /demorou para responder/,
    );
    await assert.rejects(
      () => neuralakeJson("s", {}, "reasoning", async () => new Response("", { status: 502 })),
      /não concluiu/,
    );
    await assert.rejects(
      () => neuralakeJson("s", {}, "reasoning", async () => Response.json({ choices: [] })),
      /não devolveu/,
    );
    const result = await neuralakeJson("s", {}, "code", async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "code");
      return Response.json({
        choices: [{ message: { content: JSON.stringify(output) } }],
        usage: { total_tokens: 25 },
      });
    });
    assert.deepEqual(result.value, output);
    assert.equal(result.usage?.total_tokens, 25);
  } finally {
    if (previous === undefined) delete process.env.NEURALAKE_API_KEY;
    else process.env.NEURALAKE_API_KEY = previous;
  }
});

test("provider knowledge lists become text without accepting arbitrary objects or changing visibility", () => {
  const result = parseGeneratedDefinition({
    ...spec,
    knowledge: ["Referência 1", "Referência 2"],
    visibility: "commercial",
  });
  assert.equal(result.knowledge, "Referência 1\nReferência 2");
  assert.equal(result.visibility, "private");
  assert.equal(parseGeneratedDefinition({ ...spec, knowledge: null }).knowledge, "");
  assert.throws(() => parseGeneratedDefinition({ ...spec, knowledge: [{ secret: "object" }] }));
});

test("a short but nonempty section passes presence verification while whitespace does not", () => {
  const content = JSON.stringify({
    ...output,
    sections: output.sections.map((s) => ({ ...s, content: "R$ 2.000" })),
  });
  assert.equal(verifyAgentResult(spec.sections, content).decision, "approved");
  assert.equal(
    verifyAgentResult(
      spec.sections,
      JSON.stringify({
        ...output,
        sections: output.sections.map((s) => ({ ...s, content: "   " })),
      }),
    ).decision,
    "rejected",
  );
});

test("provider output is normalized before strict verification", () => {
  const normalized = normalizeAgentResult(
    {
      name: "Resposta útil",
      sections: [{ title: "ignored", text: "Primeira parte" }, "Segunda parte"],
      commentary: "ignored",
    },
    spec.sections,
  );
  const parsed = agentResultSchema.parse(normalized);
  assert.equal(parsed.title, "Resposta útil");
  assert.deepEqual(
    parsed.sections.map((section) => section.heading),
    spec.sections,
  );
  assert.deepEqual(parsed.artifacts, []);
});

test("mission manager uses, hires or creates without accepting invented suppliers", () => {
  const offer = crypto.randomUUID();
  assert.deepEqual(resolveMissionRoute({ mode: "internal", offerVersionId: null }, true, [offer]), {
    mode: "internal",
  });
  assert.deepEqual(resolveMissionRoute({ mode: "network", offerVersionId: offer }, true, [offer]), {
    mode: "network",
    offerVersionId: offer,
  });
  assert.deepEqual(
    resolveMissionRoute({ mode: "network", offerVersionId: crypto.randomUUID() }, true, [offer]),
    { mode: "created" },
  );
  assert.deepEqual(resolveMissionRoute({ mode: "internal", offerVersionId: null }, false, []), {
    mode: "created",
  });
  assert.deepEqual(resolveMissionRoute({ mode: "create", offerVersionId: null }, true, [offer]), {
    mode: "created",
  });
});

function auctionOffer(
  id: string,
  companyId: string,
  price: number,
  title: string,
  category = "Conteúdo",
): AgentOffer {
  return {
    id,
    offerId: crypto.randomUUID(),
    companyId,
    companyName: title,
    title,
    description: `${title} cria conteúdo especializado`,
    price,
    deadlineHours: 24,
    capability: "agent.task.v1",
    category,
    exampleTask: `Executar ${title}`,
    criteria: [
      { criterion: "Formato CSV", expected: "sku,size,priceCents" },
      { criterion: "Produtos preservados", expected: true },
      { criterion: "Preços preservados", expected: true },
      { criterion: "Identificadores únicos", expected: true },
    ],
  };
}

test("marketplace shortlists at most four relevant affordable agents", () => {
  const preferred = crypto.randomUUID();
  const offers = [
    auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 10, "Planilhas", "Operações"),
    auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 20, "Roteiros"),
    auctionOffer(preferred, crypto.randomUUID(), 25, "Legendas"),
    auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 30, "Calendário editorial"),
    auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 35, "Pesquisa de pautas"),
    auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 200, "Diretor caro"),
  ];
  const shortlisted = shortlistAuctionCandidates(
    offers,
    "Criar roteiro e legenda para conteúdo",
    "Conteúdo",
    100,
    preferred,
  );
  assert.equal(shortlisted.length, 4);
  assert.equal(shortlisted[0]?.id, preferred);
  assert.equal(
    shortlisted.some((offer) => offer.price > 100),
    false,
  );
});

test("auction combines viability, verified reputation and price without accepting invalid bids", () => {
  const reliable = auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 50, "Agente confiável");
  const risky = auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 90, "Agente arriscado");
  const cheap = auctionOffer(crypto.randomUUID(), crypto.randomUUID(), 10, "Agente econômico");
  const offers = [reliable, risky, cheap];
  const reputations = new Map([
    [reliable.companyId, historicalReputation(18, 2)],
    [risky.companyId, historicalReputation(0, 8)],
    [cheap.companyId, historicalReputation(0, 0)],
  ]);
  const winner = selectAuctionWinner(
    [
      {
        offerVersionId: risky.id,
        viability: 98,
        approach: "Executar a tarefa em uma etapa especializada.",
        reason: "Alta aderência declarada.",
      },
      {
        offerVersionId: reliable.id,
        viability: 88,
        approach: "Executar e revisar a entrega antes de enviar.",
        reason: "Boa aderência e histórico.",
      },
      {
        offerVersionId: cheap.id,
        viability: 54,
        approach: "Tentar executar com capacidade apenas parcial.",
        reason: "Capacidade insuficiente.",
      },
      {
        offerVersionId: crypto.randomUUID(),
        viability: 100,
        approach: "Proposta com fornecedor inexistente na rodada.",
        reason: "ID inventado.",
      },
    ],
    offers,
    reputations,
    100,
  );
  assert.equal(winner?.offerVersionId, reliable.id);
  assert.equal(winner?.reputation.approved, 18);
  assert.ok((winner?.totalScore ?? 0) > 0.75);
});

test("on-demand commercial metadata does not expose the private mission", () => {
  const privateMission = "Campanha sigilosa para Cliente Órbita";
  const created = createOnDemandAgentDefinition(
    {
      category: "Marketing",
      instructions: `Execute ${privateMission} seguindo todos os critérios privados enviados.`,
      model: "reasoning",
    },
    7,
  );
  const publicMetadata = JSON.stringify({
    name: created.name,
    description: created.description,
    serviceTitle: created.serviceTitle,
    sections: created.sections,
    exampleTask: created.exampleTask,
  });
  assert.equal(publicMetadata.includes(privateMission), false);
  assert.equal(created.instructions.includes(privateMission), true);
  assert.equal(created.price, 7);
  assert.throws(
    () => createOnDemandAgentDefinition({ ...created, instructions: created.instructions }, 0),
    /orçamento restante/,
  );
});

test("mission budget is allocated before paid steps without exceeding its ceiling", () => {
  assert.deepEqual(allocateMissionStepBudgets([true, false, true], 5), [3, 0, 2]);
  assert.deepEqual(allocateMissionStepBudgets([false, false], 1), [0, 0]);
  assert.throws(() => allocateMissionStepBudgets([true, true], 1), /um crédito por etapa paga/);
});

test("a five-agent chain receives deterministic caps inside the mission budget", () => {
  assert.equal(MAX_MISSION_STEPS, 5);
  const caps = allocateMissionStepBudgets(Array(MAX_MISSION_STEPS).fill(true), 12);
  assert.deepEqual(caps, [3, 3, 2, 2, 2]);
  assert.equal(
    caps.reduce((sum, value) => sum + value, 0),
    12,
  );
});

test("verified agent deliveries await settlement before the mission is complete", () => {
  assert.equal(missionStatusAfterDelivery(3, 5, true), "running");
  assert.equal(missionStatusAfterDelivery(5, 5, true), "awaiting_review");
  assert.equal(missionStatusAfterDelivery(5, 5, false), "completed");
});

test("an ancestor correction stops before execution when any descendant has started", () => {
  for (const descendant of [
    { status: "failed", orderId: crypto.randomUUID(), result: { title: "Entrega antiga" } },
    { status: "pending", orderId: crypto.randomUUID() },
    { status: "pending", result: { title: "Entrega antiga" } },
    { status: "running" },
  ]) {
    let correctionExecuted = false;
    assert.throws(() => {
      requireUntouchedMissionDescendants([descendant]);
      correctionExecuted = true;
    }, /outras etapas começaram/);
    assert.equal(correctionExecuted, false);
  }
  assert.doesNotThrow(() =>
    requireUntouchedMissionDescendants([{ status: "pending", orderId: null, result: null }]),
  );
});
