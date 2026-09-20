import test from "node:test";
import assert from "node:assert/strict";
import { agentDefinitionSchema } from "../src/lib/agent-definition.ts";
import {
  agentMatchesMission,
  fallbackMissionPlan,
  missionCapability,
  planMatchesMission,
} from "../src/lib/mission-fallback.ts";
import type { AgentOffer } from "../src/lib/a2a-contract.ts";

const proposalOffer = {
  id: "11111111-1111-4111-a111-111111111111",
  offerId: "22222222-2222-4222-a222-222222222222",
  companyId: "33333333-3333-4333-a333-333333333333",
  companyName: "Propostas Studio",
  title: "Propostas comerciais",
  description: "Cria propostas comerciais para serviços de marketing.",
  price: 15,
  deadlineHours: 24,
  capability: "agent.task.v1",
  category: "Vendas",
  exampleTask: "Crie uma proposta comercial para uma clínica.",
  criteria: [],
} satisfies AgentOffer;

test("fallback planning hires a relevant affordable marketplace agent", () => {
  const plan = fallbackMissionPlan(
    "Crie uma proposta comercial para uma clínica contratar marketing.",
    30,
    null,
    [proposalOffer],
  );
  assert.equal(plan.steps[0].action, "network");
  assert.equal(plan.steps[0].offerVersionId, proposalOffer.id);
  assert.equal(plan.steps[0].category, "Vendas");
});

test("fallback planning creates a specialist instead of hiring an unrelated offer", () => {
  const plan = fallbackMissionPlan("Desenvolva uma API de cobrança em TypeScript.", 20, null, [
    proposalOffer,
  ]);
  assert.equal(plan.steps[0].action, "create");
  assert.equal(plan.steps[0].model, "code");
  assert.equal(plan.steps[0].offerVersionId, null);
});

test("fallback planning can use a compatible internal agent", () => {
  const own = agentDefinitionSchema.parse({
    name: "Analista de dados",
    description: "Analisa dados de vendas e cria diagnósticos.",
    serviceTitle: "Análise de vendas",
    category: "Análise",
    instructions: "Analise os dados fornecidos e entregue conclusões fundamentadas.",
    knowledge: "",
    sections: ["Diagnóstico"],
    exampleTask: "Analise os dados mensais de vendas da empresa.",
    model: "text",
    price: 10,
    visibility: "private",
    capability: "agent.task.v1",
  });
  const plan = fallbackMissionPlan("Analise meus dados de vendas.", 20, own, []);
  assert.equal(plan.steps[0].action, "internal");
  assert.equal(plan.steps[0].offerVersionId, null);
});

test("landing page requires a code specialist and rejects a commercial proposal agent", () => {
  const task = "Crie uma landing page para uma agência de marketing.";
  assert.deepEqual(missionCapability(task), {
    category: "Desenvolvimento",
    model: "code",
    webArtifact: true,
  });
  assert.equal(agentMatchesMission(task, proposalOffer), false);
  const plan = fallbackMissionPlan(task, 50, null, [proposalOffer]);
  assert.equal(plan.steps[0].action, "create");
  assert.equal(plan.steps[0].role, "Especialista de Desenvolvimento");
  assert.equal(plan.steps[0].model, "code");
  assert.match(plan.steps[0].instructions, /arquivo HTML/);
});

test("stored plans cannot route a landing page to a sales text agent", () => {
  assert.equal(
    planMatchesMission("Crie uma landing page", [{ category: "Vendas", model: "text" }]),
    false,
  );
  assert.equal(
    planMatchesMission("Crie uma landing page", [{ category: "Desenvolvimento", model: "code" }]),
    true,
  );
});
