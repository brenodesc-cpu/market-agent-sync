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
