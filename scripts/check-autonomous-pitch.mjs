#!/usr/bin/env node
// Remote acceptance check. Default is read-only; --run authorizes one <=20-credit demo.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";

const option = (name) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--config")) throw Error("Use --config com a configuração MCP privada.");
const file = JSON.parse(await readFile(option("--config"), "utf8"));
const config = file.mcpServers?.neuramarket;
const base = new URL(config?.url ?? config?.env?.NM_BASE_URL);
if (
  base.protocol !== "https:" &&
  !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname))
)
  throw Error("Use HTTPS ou localhost.");
const key = config?.headers?.Authorization ?? `Bearer ${config?.env?.NM_AGENT_KEY ?? ""}`;
if (!/^Bearer nm_[a-f0-9]{64}$/.test(key)) throw Error("Credencial MCP ausente ou inválida.");
const endpoint = new URL("/api/mcp", base);
let counter = 0;
async function rpc(method, params = {}) {
  const id = ++counter;
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!response.ok) throw Error(`MCP HTTP ${response.status}`);
  const text = await response.text();
  const message = response.headers.get("content-type")?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)))
        .find((entry) => entry.id === id)
    : JSON.parse(text);
  if (!message || message.error) throw Error("Resposta MCP inválida.");
  if (message.result.isError)
    throw Error(
      `Ferramenta recusou a operação: ${JSON.stringify(message.result.content).replaceAll(key.slice(7), "[redacted]")}`,
    );
  return message.result.structuredContent ?? message.result;
}
const call = (name, args = {}) => rpc("tools/call", { name, arguments: args });
const required = [
  "start_browser_mission",
  "quote_browser_mission",
  "hire_browser_quote",
  "get_order",
  "get_wallet",
  "download_and_verify_delivery",
];
const tools = (await rpc("tools/list")).tools.map((tool) => tool.name);
const missing = required.filter((name) => !tools.includes(name));
if (missing.length) {
  console.log(
    JSON.stringify(
      {
        ready: false,
        missing,
        reason: "Publicar a versão com a migração 0017 antes da demonstração.",
      },
      null,
      2,
    ),
  );
  process.exit(2);
}
if (!process.argv.includes("--run")) {
  console.log(
    JSON.stringify(
      {
        toolsReady: true,
        completeFlowVerified: false,
        next: "Executar com --run após conectar o executor. Nenhum crédito gasto nesta conferência.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (!process.argv.includes("--state"))
  throw Error("Use --state com um arquivo privado para retomar sem duplicar a compra.");
const statePath = option("--state");
let state;
try {
  state = JSON.parse(await readFile(statePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (state && state.origin !== base.origin) throw Error("O estado pertence a outro servidor.");
if (!state) {
  state = {
    origin: base.origin,
    input: {
      requestId: randomUUID(),
      objective: "Teste o formulário da página de demonstração no computador e no celular.",
      budget: 20,
      testFailure: true,
      authorizeAutomaticPayment: true,
    },
  };
  await writeFile(statePath, JSON.stringify(state), { flag: "wx", mode: 0o600 });
}
if (!state.orderId) {
  const purchase = await call("start_browser_mission", state.input);
  assert.ok(purchase.orderId, "Nenhuma contratação foi criada.");
  state.orderId = purchase.orderId;
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
}
console.log(`Acompanhando ${state.orderId}; nenhuma chamada de correção ou aceite será feita.`);
let detail, priorStatus;
const deadline = Date.now() + 180000;
while (Date.now() < deadline) {
  detail = await call("get_order", { orderId: state.orderId });
  if (priorStatus !== detail.order.status) {
    priorStatus = detail.order.status;
    console.log(`Estado: ${priorStatus}, versão ${detail.order.current_delivery_version}`);
  }
  if (["settled", "cancelled", "expired"].includes(detail.order.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
assert.equal(detail.order.status, "settled", "A operação não concluiu autonomamente no prazo.");
assert.equal(detail.contract.requires_human_review, false);
assert.equal(detail.humanReviews.length, 0);
assert.equal(detail.deliveries.length, 2);
assert.equal(detail.reports.length, 2);
assert.equal(detail.reports.find((r) => r.delivery_version === 1)?.decision, "rejected");
assert.equal(detail.reports.find((r) => r.delivery_version === 2)?.decision, "approved");
assert.equal(detail.contract.price_units, 13);
const brief = detail.contract.order_data;
assert.equal(brief.settlementPolicy, "verified-browser-v1");
assert.ok(brief.market.offers.length >= 2);
assert.equal(brief.market.selectedOffer, detail.contract.offer_version_id);
assert.ok(brief.inference.requestedModel);
assert.ok(
  brief.inference.usage?.total_tokens > 0,
  "O provedor não informou o consumo; custo por token não comprovado.",
);
assert.ok(
  typeof brief.inference.estimatedCostUsd === "number" && brief.inference.estimatedCostUsd >= 0,
);
for (const type of [
  "goal_interpreted",
  "offers_evaluated",
  "price_negotiated",
  "contracted",
  "correction_requested",
  "settled",
])
  assert.ok(
    detail.events.some((event) => event.event_type === type),
    `Falta registrar ${type}`,
  );
assert.equal(detail.events.filter((e) => e.event_type === "settled").length, 1);
const delivery = detail.deliveries.find((d) => d.version === 2);
const verified = await call("download_and_verify_delivery", {
  downloadUrl: delivery.downloadUrl,
  sha256: delivery.sha256,
});
assert.equal(verified.verified, true);
assert.equal(createHash("sha256").update(verified.content).digest("hex"), delivery.sha256);
const walletBefore = await call("get_wallet");
const replay = await call("start_browser_mission", state.input);
assert.equal(replay.orderId, state.orderId);
assert.deepEqual(await call("get_wallet"), walletBefore, "A repetição alterou o saldo.");
const desktop = await call("quote_browser_mission", {
  requestId: randomUUID(),
  objective:
    "Quero apenas uma captura desktop da página de demonstração, sem preencher formulário.",
  budget: 5,
});
assert.notEqual(
  desktop.quote.selectedOffer,
  brief.market.selectedOffer,
  "A mudança de escopo não mudou o fornecedor.",
);
const result = {
  completedAt: new Date().toISOString(),
  orderId: state.orderId,
  reviewUrl: detail.reviewUrl,
  autonomousFlowVerified: true,
  price: 13,
  budget: 20,
  evidenceSha256: delivery.sha256,
  inference: brief.inference,
  events: detail.events,
  reports: detail.reports,
  remainingPresentationStep:
    "Mostrar a mesma tarefa no modo manual para comparar com a execução A2A.",
  limits:
    "Página controlada, créditos simulados, auditor autorizado, negociação por regras e USD estimado. Não comprova adoção comercial nem certificação bancária.",
};
await writeFile(`${statePath}.evidence.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
console.log(JSON.stringify(result, null, 2));
