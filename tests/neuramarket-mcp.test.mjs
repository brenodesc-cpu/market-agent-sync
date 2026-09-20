import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  NeuraMarketApiError,
  NeuraMarketClient,
  createNeuraMarketToolHandlers,
  readNeuraMarketConfig,
} from "../scripts/neuramarket-mcp.mjs";

const baseUrl = new URL("https://market.example/");
const agentKey = "nm_test_secret_value";

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

test("MCP configuration requires a key and rejects plaintext remote HTTP", () => {
  assert.throws(
    () => readNeuraMarketConfig({ NM_BASE_URL: "https://market.example" }),
    /NM_AGENT_KEY/,
  );
  assert.throws(
    () => readNeuraMarketConfig({ NM_BASE_URL: "http://market.example", NM_AGENT_KEY: "nm_x" }),
    /HTTPS/,
  );
  assert.equal(
    readNeuraMarketConfig({ NM_BASE_URL: "http://127.0.0.1:3099/", NM_AGENT_KEY: " nm_x " })
      .agentKey,
    "nm_x",
  );
});

test("client lists agents and starts a scoped idempotent mission", async () => {
  const requests = [];
  const client = new NeuraMarketClient({
    baseUrl,
    agentKey,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/offers")) return jsonResponse({ offers: [{ id: "offer-1" }] });
      return jsonResponse(
        {
          requestId: "11111111-1111-4111-a111-111111111111",
          status: "planning",
          links: { self: "/api/a2a/missions/11111111-1111-4111-a111-111111111111" },
        },
        201,
      );
    },
  });
  assert.deepEqual(await client.listAgents(), { offers: [{ id: "offer-1" }] });
  const requestId = "11111111-1111-4111-a111-111111111111";
  const mission = await client.startMission({
    requestId,
    task: "Crie uma campanha completa para amanhã.",
    budget: 30,
  });
  assert.equal(mission.status, "planning");
  assert.equal(mission.links.self, `https://market.example/api/a2a/missions/${requestId}`);
  assert.equal(requests[0].url, "https://market.example/api/a2a/offers");
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${agentKey}`);
  assert.equal(requests[1].url, "https://market.example/api/a2a/missions");
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    requestId,
    task: "Crie uma campanha completa para amanhã.",
    budget: 30,
  });
});

test("mission status and one-step advance use the incremental endpoints", async () => {
  const paths = [];
  const client = new NeuraMarketClient({
    baseUrl,
    agentKey,
    fetchImpl: async (url, init) => {
      paths.push({ path: new URL(url).pathname, method: init.method ?? "GET" });
      return jsonResponse(
        { status: "running", nextAction: "wait", leaseUntil: "2099-01-01" },
        202,
        {
          "Retry-After": "2",
        },
      );
    },
  });
  const requestId = "11111111-1111-4111-a111-111111111111";
  await client.getMission(requestId);
  const advanced = await client.advanceMission(requestId);
  assert.equal(advanced.nextAction, "wait");
  assert.deepEqual(paths, [
    { path: `/api/a2a/missions/${requestId}`, method: "GET" },
    { path: `/api/a2a/missions/${requestId}/advance`, method: "POST" },
  ]);
});

test("direct marketplace tools hire one selected offer and resume its order", async () => {
  const requests = [];
  const client = new NeuraMarketClient({
    baseUrl,
    agentKey,
    fetchImpl: async (url, init) => {
      requests.push({ path: new URL(url).pathname, method: init.method ?? "GET", body: init.body });
      return jsonResponse({
        orderId: "33333333-3333-4333-a333-333333333333",
        reviewUrl:
          "/studio?view=orders&company=44444444-4444-4444-a444-444444444444&orderId=33333333-3333-4333-a333-333333333333",
      });
    },
  });
  const orderId = "33333333-3333-4333-a333-333333333333";
  const requestId = "11111111-1111-4111-a111-111111111111";
  const offerVersionId = "22222222-2222-4222-a222-222222222222";
  const hired = await client.hireAgent({
    requestId,
    offerVersionId,
    title: "Roteiro para Instagram",
    task: "Escreva um roteiro de vídeo curto para o lançamento.",
    budget: 12,
  });
  assert.equal(
    hired.reviewUrl,
    "https://market.example/studio?view=orders&company=44444444-4444-4444-a444-444444444444&orderId=33333333-3333-4333-a333-333333333333",
  );
  await client.getOrder(orderId);
  await client.runOrder(orderId);
  assert.deepEqual(JSON.parse(requests[0].body), {
    requestId,
    offerVersionId,
    title: "Roteiro para Instagram",
    task: "Escreva um roteiro de vídeo curto para o lançamento.",
    budget: 12,
  });
  assert.deepEqual(
    requests.map(({ path, method }) => ({ path, method })),
    [
      { path: "/api/a2a/orders", method: "POST" },
      { path: `/api/a2a/orders/${orderId}`, method: "GET" },
      { path: `/api/a2a/orders/${orderId}/run`, method: "POST" },
    ],
  );
});

test("delivery download verifies exact bytes and refuses credential forwarding to another origin", async () => {
  const content = JSON.stringify({ title: "Entrega", sections: [] });
  const sha256 = createHash("sha256").update(content).digest("hex");
  let calls = 0;
  const client = new NeuraMarketClient({
    baseUrl,
    agentKey,
    fetchImpl: async (_url, init) => {
      calls++;
      assert.equal(init.headers.Authorization, `Bearer ${agentKey}`);
      return new Response(content, {
        headers: { "Content-Type": "application/json", "X-Content-SHA256": sha256 },
      });
    },
  });
  const result = await client.downloadAndVerifyDelivery({
    downloadUrl: "/api/a2a/orders/order-1/deliveries/delivery-1",
    sha256,
  });
  assert.equal(result.verified, true);
  assert.equal(result.actualSha256, sha256);
  assert.equal(result.content, content);
  await assert.rejects(
    client.downloadAndVerifyDelivery({
      downloadUrl: "/api/a2a/orders/order-1/deliveries/delivery-1",
      sha256: "0".repeat(64),
    }),
    (error) => error instanceof NeuraMarketApiError && error.code === "delivery_hash_mismatch",
  );
  await assert.rejects(
    client.downloadAndVerifyDelivery({
      downloadUrl: "https://attacker.example/steal",
      sha256,
    }),
    /mesmo servidor/,
  );
  assert.equal(calls, 2);

  const missingHeaderClient = new NeuraMarketClient({
    baseUrl,
    agentKey,
    fetchImpl: async () =>
      new Response(content, { headers: { "Content-Type": "application/json" } }),
  });
  await assert.rejects(
    missingHeaderClient.downloadAndVerifyDelivery({
      downloadUrl: "/api/a2a/orders/order-1/deliveries/delivery-1",
      sha256,
    }),
    (error) => error instanceof NeuraMarketApiError && error.code === "delivery_hash_mismatch",
  );
});

test("tool failures are actionable and never echo the configured agent key", async () => {
  const client = new NeuraMarketClient({
    baseUrl,
    agentKey,
    fetchImpl: async () =>
      jsonResponse(
        { error: "provider_unavailable", message: `provider rejected ${agentKey}` },
        503,
      ),
  });
  await assert.rejects(client.listAgents(), (error) => {
    assert.ok(error instanceof NeuraMarketApiError);
    assert.equal(error.code, "provider_unavailable");
    assert.equal(error.message.includes(agentKey), false);
    return true;
  });
  const result = await createNeuraMarketToolHandlers(client).listAgents({});
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text.includes(agentKey), false);
  assert.match(result.content[0].text, /provider_unavailable/);
});

test("stdio server negotiates MCP and advertises mission and direct marketplace tools", async () => {
  const child = spawn(process.execPath, ["scripts/neuramarket-mcp.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NM_BASE_URL: baseUrl.href, NM_AGENT_KEY: agentKey },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  child.stdin.end(
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ]
      .map((message) => JSON.stringify(message))
      .join("\n") + "\n",
  );
  const [code] = await once(child, "close");
  assert.equal(code, 0);
  assert.equal(stderr.includes(agentKey), false);
  const responses = stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(responses[0].result.serverInfo.name, "neuramarket-a2a");
  const tools = responses.find((response) => response.id === 2).result.tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "advance_fx_order",
    "advance_mission",
    "buy_browser_test",
    "cancel_fx_order",
    "cancel_order",
    "connection_status",
    "download_and_verify_delivery",
    "get_fx_order",
    "get_fx_wallet",
    "get_mission",
    "get_order",
    "get_wallet",
    "hire_agent",
    "hire_browser_quote",
    "hire_fx",
    "list_agents",
    "quote_browser_mission",
    "quote_browser_test",
    "quote_fx",
    "retry_browser_test",
    "run_order",
    "start_browser_mission",
    "start_fx_mission",
    "start_mission",
  ]);
  const start = tools.find((tool) => tool.name === "start_mission");
  assert.ok(start.inputSchema.required.includes("requestId"));
  const hire = tools.find((tool) => tool.name === "hire_agent");
  assert.ok(hire.inputSchema.required.includes("requestId"));
  const advance = tools.find((tool) => tool.name === "advance_mission");
  assert.equal(advance.annotations.idempotentHint, false);
});

test("delivery limit cancels a chunked stream before buffering the full response", async () => {
  for (const declaredSize of [undefined, "10", "1048577"]) {
    let cancelled = false;
    let produced = 0;
    const stream = new ReadableStream({
      pull(controller) {
        produced++;
        controller.enqueue(new Uint8Array(65536));
      },
      cancel() {
        cancelled = true;
      },
    });
    const client = new NeuraMarketClient({
      baseUrl,
      agentKey,
      fetchImpl: async () =>
        new Response(stream, {
          headers: declaredSize ? { "Content-Length": declaredSize } : {},
        }),
    });
    await assert.rejects(
      client.downloadAndVerifyDelivery({
        downloadUrl: "/api/a2a/orders/order-1/deliveries/delivery-1",
        sha256: "0".repeat(64),
      }),
      /limite de 1 MB/,
    );
    assert.equal(cancelled, true);
    assert.ok(produced <= 18, `stream read too far: ${produced} chunks`);
  }
});
