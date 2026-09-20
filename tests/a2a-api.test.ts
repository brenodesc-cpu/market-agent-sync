import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentApiHandler } from "../src/lib/a2a-api.server.ts";

const actor = { userId: crypto.randomUUID(), companyId: crypto.randomUUID() };
const requestId = crypto.randomUUID();
const snapshot = {
  missionId: crypto.randomUUID(),
  requestId,
  status: "planning" as const,
  summary: "Planejando a missão.",
  blockedTools: [],
  initialBudget: 40,
  remainingBudget: 40,
  errorMessage: null,
  leaseUntil: null,
  steps: [],
};

function apiRequest(method: string, body?: unknown) {
  return new Request("https://example.test/api/a2a/missions", {
    method,
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function externalStepSnapshot(status: "awaiting_review" | "completed" = "awaiting_review") {
  const orderId = crypto.randomUUID();
  const deliveryId = crypto.randomUUID();
  return {
    ...snapshot,
    status: status === "completed" ? ("completed" as const) : ("awaiting_review" as const),
    remainingBudget: 28,
    steps: [
      {
        status,
        role: "Roteirista",
        source: "network" as const,
        provider: "Studio Roteiro",
        reason: "Inclui o briefing privado do comprador.",
        result: {
          title: "Segredo comercial",
          sections: [{ heading: "Roteiro", content: "Conteúdo privado" }],
          artifacts: [],
        },
        order: {
          order: {
            id: orderId,
            title: "Pedido privado",
            status: status === "completed" ? "settled" : "accepted",
            buyer_company_id: actor.companyId,
            supplier_company_id: crypto.randomUUID(),
            current_delivery_version: 2,
            budget_cap_units: 12,
            selected_reason: "Dados privados",
            created_at: new Date().toISOString(),
          },
          contract: {
            id: crypto.randomUUID(),
            order_id: orderId,
            offer_version_id: crypto.randomUUID(),
            price_units: 12,
            commission_bps: 1000,
            acceptance_criteria: [],
            deadline_at: new Date().toISOString(),
            revision_limit: 1,
            requires_human_review: true,
          },
          deliveries: [
            {
              id: deliveryId,
              order_id: orderId,
              version: 2,
              file_name: "entrega.json",
              media_type: "application/json",
              sha256: "a".repeat(64),
              artifact_content: '{"private":true}',
              test_upload: false,
              created_at: new Date().toISOString(),
            },
          ],
          reports: [
            {
              id: crypto.randomUUID(),
              order_id: orderId,
              delivery_id: deliveryId,
              delivery_version: 2,
              checks: [],
              decision: "approved",
              summary: "Evidência privada",
              rules_version: "v1",
              tool_name: "agent-result-verifier",
            },
          ],
          events: [],
          humanReviews: [],
        },
        competition: [
          {
            offerVersionId: crypto.randomUUID(),
            provider: "Concorrente",
            price: 9,
            viability: 80,
            reputation: 90,
            approved: 9,
            rejected: 1,
            score: 88,
            approach: "Estratégia privada do fornecedor",
            selected: false,
          },
        ],
        errorMessage: null,
        budgetCap: 12,
      },
    ],
  };
}

test("POST missions starts only the authenticated company's chain and returns 201 with Location", async () => {
  const starts: unknown[][] = [];
  let advances = 0;
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    startAutonomousChain: async (...args) => {
      starts.push(args);
      return { ...snapshot, created: true };
    },
    advanceAutonomousChain: async () => {
      advances++;
      return snapshot;
    },
  });
  const response = await handler(
    apiRequest("POST", {
      requestId,
      task: "Crie uma cadeia de conteúdo com agentes especializados.",
      budget: 40,
      buyerCompanyId: crypto.randomUUID(),
    }),
    "missions",
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("location"), `/api/a2a/missions/${requestId}`);
  assert.deepEqual(starts, [
    [
      actor.userId,
      actor.companyId,
      requestId,
      "Crie uma cadeia de conteúdo com agentes especializados.",
      40,
    ],
  ]);
  assert.equal(advances, 0);
  const body = await response.json();
  assert.equal(body.status, "planning");
  assert.equal(body.terminal, false);
  assert.equal(body.retryable, false);
  assert.equal(body.nextAction, "advance");
  assert.deepEqual(body.links, {
    self: `/api/a2a/missions/${requestId}`,
    advance: `/api/a2a/missions/${requestId}/advance`,
  });
});

test("POST missions returns 200 for an idempotent replay", async () => {
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    startAutonomousChain: async () => ({ ...snapshot, created: false }),
  });
  const response = await handler(
    apiRequest("POST", {
      requestId,
      task: "Crie uma cadeia de conteúdo com agentes especializados.",
      budget: 40,
    }),
    "missions",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), `/api/a2a/missions/${requestId}`);
});

test("GET mission is scoped by the credential and sanitizes private agent data", async () => {
  const reads: unknown[][] = [];
  const detailed = externalStepSnapshot();
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    getAutonomousChainStatus: async (...args) => {
      reads.push(args);
      return detailed;
    },
  });
  const response = await handler(apiRequest("GET"), `missions/${requestId}`);
  assert.equal(response.status, 200);
  assert.deepEqual(reads, [[actor.userId, actor.companyId, requestId]]);
  const body = await response.json();
  assert.equal(body.status, "awaiting_review");
  assert.equal(body.nextAction, "review");
  assert.equal(body.completedSteps, 1);
  assert.equal(body.totalSteps, 1);
  assert.equal(body.pendingReviews.length, 1);
  assert.equal(body.pendingReviews[0].orderId, detailed.steps[0].order.order.id);
  assert.equal(
    body.pendingReviews[0].reviewUrl,
    `/studio?view=orders&company=${actor.companyId}&orderId=${detailed.steps[0].order.order.id}`,
  );
  assert.deepEqual(body.steps[0].verification, { decision: "approved" });
  assert.deepEqual(body.steps[0].delivery, {
    id: detailed.steps[0].order.deliveries[0].id,
    version: 2,
    sha256: "a".repeat(64),
    downloadUrl: `/api/a2a/orders/${detailed.steps[0].order.order.id}/deliveries/${detailed.steps[0].order.deliveries[0].id}`,
  });
  assert.equal(body.steps[0].price, 12);
  assert.equal(body.steps[0].result, undefined);
  assert.equal(body.steps[0].competition, undefined);
  assert.equal(body.steps[0].reason, undefined);
  assert.equal(JSON.stringify(body).includes("Conteúdo privado"), false);
  assert.equal(JSON.stringify(body).includes("Estratégia privada"), false);
});

test("GET mission returns 404 outside the credential's company scope", async () => {
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    getAutonomousChainStatus: async () => null,
  });
  const response = await handler(apiRequest("GET"), `missions/${crypto.randomUUID()}`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "mission_not_found" });
});

test("POST mission advance performs at most one executor call", async () => {
  let calls = 0;
  const afterPlanning = { ...snapshot, status: "running" as const };
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    getAutonomousChainStatus: async () => snapshot,
    advanceAutonomousChain: async (userId, companyId, suppliedRequestId) => {
      calls++;
      assert.deepEqual(
        [userId, companyId, suppliedRequestId],
        [actor.userId, actor.companyId, requestId],
      );
      return afterPlanning;
    },
  });
  const response = await handler(apiRequest("POST"), `missions/${requestId}/advance`);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal((await response.json()).status, "running");
});

test("POST mission advance returns 202 and Retry-After while another worker owns the lease", async () => {
  let advances = 0;
  const leased = {
    ...snapshot,
    status: "running" as const,
    leaseUntil: new Date(Date.now() + 90_000).toISOString(),
  };
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    getAutonomousChainStatus: async () => leased,
    advanceAutonomousChain: async () => {
      advances++;
      return leased;
    },
  });
  const response = await handler(apiRequest("POST"), `missions/${requestId}/advance`);
  assert.equal(response.status, 202);
  assert.ok(Number(response.headers.get("retry-after")) >= 1);
  assert.equal(advances, 0);
  const body = await response.json();
  assert.equal(body.nextAction, "wait");
  assert.equal(body.leaseUntil, leased.leaseUntil);
});

test("POST mission advance stops at pending human review", async () => {
  let advances = 0;
  const awaitingReview = externalStepSnapshot();
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    getAutonomousChainStatus: async () => awaitingReview,
    advanceAutonomousChain: async () => {
      advances++;
      return awaitingReview;
    },
  });
  const response = await handler(apiRequest("POST"), `missions/${requestId}/advance`);
  assert.equal(response.status, 200);
  assert.equal(advances, 0);
  assert.equal((await response.json()).nextAction, "review");
});

test("POST mission advance reconciles a settled order even while the persisted step awaits review", async () => {
  let advances = 0;
  const stale = externalStepSnapshot();
  stale.steps[0].order.order.status = "settled";
  const completed = externalStepSnapshot("completed");
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    getAutonomousChainStatus: async () => stale,
    advanceAutonomousChain: async () => {
      advances++;
      return completed;
    },
  });
  const response = await handler(apiRequest("POST"), `missions/${requestId}/advance`);
  assert.equal(response.status, 200);
  assert.equal(advances, 1);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.equal(body.terminal, true);
  assert.equal(body.nextAction, "done");
  assert.deepEqual(body.pendingReviews, []);
});

test("POST mission advance leaves a terminal failure untouched", async () => {
  let advances = 0;
  const terminalFailure = {
    ...snapshot,
    status: "failed" as const,
    errorMessage: "Esta capacidade indisponível exige que você inicie uma nova missão.",
  };
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    getAutonomousChainStatus: async () => terminalFailure,
    advanceAutonomousChain: async () => {
      advances++;
      return terminalFailure;
    },
  });
  const response = await handler(apiRequest("POST"), `missions/${requestId}/advance`);
  assert.equal(response.status, 200);
  assert.equal(advances, 0);
  const body = await response.json();
  assert.equal(body.terminal, true);
  assert.equal(body.retryable, false);
  assert.equal(body.nextAction, "restart");
});

test("mission routes map payload, dependency and provider failures", async () => {
  const base = {
    authenticateAgent: async () => actor,
    startAutonomousChain: async () => ({ ...snapshot, created: true }),
  };
  const tooLarge = createAgentApiHandler(base);
  const hugeResponse = await tooLarge(
    new Request("https://example.test/api/a2a/missions", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: "x".repeat(262145),
    }),
    "missions",
  );
  assert.equal(hugeResponse.status, 413);
  assert.deepEqual(await hugeResponse.json(), { error: "body_too_large" });

  const infeasible = createAgentApiHandler({
    ...base,
    startAutonomousChain: async () => {
      throw new Error("O saldo disponível não cobre esta etapa da missão.");
    },
  });
  const infeasibleResponse = await infeasible(
    apiRequest("POST", {
      requestId,
      task: "Crie uma cadeia de conteúdo com agentes especializados.",
      budget: 40,
    }),
    "missions",
  );
  assert.equal(infeasibleResponse.status, 422);
  assert.equal((await infeasibleResponse.json()).error, "mission_not_feasible");

  const provider = createAgentApiHandler({
    ...base,
    startAutonomousChain: async () => {
      throw new Error("A NeuraLake não concluiu a execução.");
    },
  });
  const providerResponse = await provider(
    apiRequest("POST", {
      requestId,
      task: "Crie uma cadeia de conteúdo com agentes especializados.",
      budget: 40,
    }),
    "missions",
  );
  assert.equal(providerResponse.status, 503);
  assert.equal((await providerResponse.json()).error, "provider_unavailable");

  const unavailableProvider = createAgentApiHandler({
    ...base,
    startAutonomousChain: async () => {
      throw new Error("NeuraLake indisponível (503).");
    },
  });
  const unavailableProviderResponse = await unavailableProvider(
    apiRequest("POST", {
      requestId,
      task: "Crie uma cadeia de conteúdo com agentes especializados.",
      budget: 40,
    }),
    "missions",
  );
  assert.equal(unavailableProviderResponse.status, 503);
  assert.equal((await unavailableProviderResponse.json()).error, "provider_unavailable");
});

test("mission routes reject invalid credentials and input before changing state", async () => {
  let starts = 0;
  const unauthorized = createAgentApiHandler({
    authenticateAgent: async () => {
      throw new Error("bad credential");
    },
    startAutonomousChain: async () => {
      starts++;
      return { ...snapshot, created: true };
    },
  });
  const unauthorizedResponse = await unauthorized(
    apiRequest("POST", { requestId, task: "Uma missão válida para agentes.", budget: 20 }),
    "missions",
  );
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(starts, 0);

  const invalid = createAgentApiHandler({
    authenticateAgent: async () => actor,
    startAutonomousChain: async () => {
      starts++;
      return { ...snapshot, created: true };
    },
  });
  const invalidResponse = await invalid(
    apiRequest("POST", { requestId: "not-a-uuid", task: "curta", budget: 0 }),
    "missions",
  );
  assert.equal(invalidResponse.status, 400);
  assert.equal(starts, 0);
});

test("orders retain their create-then-run contract", async () => {
  const orderId = crypto.randomUUID();
  let orderRuns = 0;
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    createOrder: async (_userId, request) => {
      assert.equal(request.buyerCompanyId, actor.companyId);
      assert.equal(request.humanReview, true);
      return { orderId, status: "contracted" };
    },
    runOrder: async () => {
      orderRuns++;
      throw new Error("orders must run through the separate endpoint");
    },
  });
  const response = await handler(
    apiRequest("POST", {
      requestId: crypto.randomUUID(),
      title: "Pedido de conteúdo",
      humanReview: false,
      task: "Escreva uma proposta comercial completa.",
      budget: 20,
    }),
    "orders",
  );
  assert.equal(response.status, 201);
  assert.equal(orderRuns, 0);
  assert.deepEqual(await response.json(), {
    orderId,
    status: "contracted",
    next: `/api/a2a/orders/${orderId}/run`,
    reviewUrl: `/studio?view=orders&company=${actor.companyId}&orderId=${orderId}`,
  });
});

test("connection check returns only the authenticated company and does not spend", async () => {
  const handle = createAgentApiHandler({ authenticateAgent: async () => actor });
  const response = await handle(apiRequest("GET"), "connection");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.companyId, actor.companyId);
  assert.equal(data.connected, true);
  assert.equal(data.humanApprovalRequired, true);
  assert.equal(data.userId, undefined);
});

test("wallet uses authenticated company and rejects invalid credentials before reading", async () => {
  const seen: string[][] = [];
  const agentWallet = async (user: string, company: string) => {
    seen.push([user, company]);
    return { currency: "simulated_credits", account: { company_id: company, available_units: 20 } };
  };
  const handler = createAgentApiHandler({ authenticateAgent: async () => actor, agentWallet });
  const response = await handler(
    new Request("https://example.test/api/a2a/wallet?companyId=another"),
    "wallet",
  );
  assert.equal((await response.json()).account.company_id, actor.companyId);
  assert.deepEqual(seen, [[actor.userId, actor.companyId]]);
  const blocked = createAgentApiHandler({
    authenticateAgent: async () => {
      throw new Error("revoked");
    },
    agentWallet,
  });
  assert.equal((await blocked(apiRequest("GET"), "wallet")).status, 401);
  assert.equal(seen.length, 1);
});

test("cancellation requires the authenticated buyer and never takes identity from request body", async () => {
  const detail = externalStepSnapshot().steps[0].order;
  const calls: unknown[] = [];
  const handler = createAgentApiHandler({
    authenticateAgent: async () => actor,
    orderDetails: async () => detail as never,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { status: "cancelled" };
    },
  });
  const path = `orders/${detail.order.id}/cancel`;
  assert.equal(
    (await handler(apiRequest("POST", { companyId: "someone-else" }), path)).status,
    200,
  );
  assert.deepEqual(calls, [
    { name: "studio_cancel_order", args: { _user: actor.userId, _order: detail.order.id } },
  ]);
  const other = createAgentApiHandler({
    authenticateAgent: async () => ({ ...actor, companyId: detail.order.supplier_company_id }),
    orderDetails: async () => detail as never,
    rpc: async () => {
      throw new Error("must not run");
    },
  });
  assert.equal((await other(apiRequest("POST"), path)).status, 403);
});
