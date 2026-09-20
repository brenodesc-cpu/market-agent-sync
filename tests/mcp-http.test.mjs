import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteMcpHandler } from "../src/lib/mcp-http.mjs";

const endpoint = "https://market.example/api/mcp";
const keys = new Map([
  ["nm_first", "company-a"],
  ["nm_second", "company-b"],
]);
function setup() {
  const calls = [];
  const revoked = new Set();
  const handler = createRemoteMcpHandler({
    authenticate: async (request) => {
      const key = request.headers.get("authorization")?.slice(7);
      if (!keys.has(key) || revoked.has(key)) throw new Error("unauthorized");
    },
    handleApi: async (request, path) => {
      calls.push({ path, key: request.headers.get("authorization"), body: await request.text() });
      return Response.json({
        connected: true,
        companyId: keys.get(request.headers.get("authorization").slice(7)),
      });
    },
  });
  return { handler, calls, revoked };
}
function request(method, params, key = "nm_first", extra = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
      Authorization: `Bearer ${key}`,
      ...extra,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  });
}
async function message(response) {
  const text = await response.text();
  return response.headers.get("content-type")?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => JSON.parse(l.slice(6)))
        .find((m) => m.id === 1)
    : JSON.parse(text);
}
test("remote MCP supports initialize and lists the same 14 tools as stdio", async () => {
  const { handler, calls } = setup();
  const init = await message(
    await handler(
      request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
    ),
  );
  assert.equal(init.result.serverInfo.name, "neuramarket-a2a");
  const response = await handler(request("tools/list"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const list = await message(response);
  assert.equal(list.result.tools.length, 14);
  assert.ok(list.result.tools.some((t) => t.name === "connection_status"));
  assert.ok(list.result.tools.some((t) => t.name === "buy_browser_test"));
  assert.equal(calls.length, 0);
});
test("concurrent MCP requests isolate companies and never make network requests", async () => {
  const { handler, calls } = setup();
  const results = await Promise.all(
    ["nm_first", "nm_second"].map((key) =>
      handler(request("tools/call", { name: "connection_status", arguments: {} }, key)).then(
        message,
      ),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.result.structuredContent.companyId),
    ["company-a", "company-b"],
  );
  assert.deepEqual(
    calls.map((c) => c.path),
    ["connection", "connection"],
  );
});
test("invalid and revoked keys cannot initialize, list or call tools", async () => {
  const { handler, revoked, calls } = setup();
  assert.equal((await handler(request("tools/list", {}, "invalid"))).status, 401);
  revoked.add("nm_first");
  assert.equal(
    (await handler(request("tools/call", { name: "connection_status", arguments: {} }))).status,
    401,
  );
  assert.equal(calls.length, 0);
});
test("cross-origin browser requests and oversized payloads are rejected before execution", async () => {
  const { handler, calls } = setup();
  assert.equal(
    (await handler(request("tools/list", {}, "nm_first", { Origin: "https://other.example" })))
      .status,
    403,
  );
  assert.equal(
    (
      await handler(
        request("tools/call", { name: "hire_agent", arguments: { task: "x".repeat(66000) } }),
      )
    ).status,
    413,
  );
  assert.equal(calls.length, 0);
});
test("tool schema rejects invalid spending requests without dispatching to API", async () => {
  const { handler, calls } = setup();
  const data = await message(
    await handler(request("tools/call", { name: "buy_browser_test", arguments: { budget: -1 } })),
  );
  assert.ok(data.error || data.result?.isError);
  assert.equal(calls.length, 0);
});

test("MCP exposes an operational resource and prompt without executing purchases", async () => {
  const { handler, calls } = setup();
  const resources = await message(await handler(request("resources/list")));
  assert.equal(resources.result.resources[0].uri, "neuramarket://guide");
  const guide = await message(
    await handler(request("resources/read", { uri: "neuramarket://guide" })),
  );
  assert.match(guide.result.contents[0].text, /aceite humano/);
  const prompts = await message(await handler(request("prompts/list")));
  assert.equal(prompts.result.prompts[0].name, "hire_specialist");
  const prompt = await message(
    await handler(
      request("prompts/get", {
        name: "hire_specialist",
        arguments: { task: "Testar formulário desktop e mobile", budget: "20" },
      }),
    ),
  );
  assert.match(prompt.result.messages[0].content.text, /20 créditos/);
  assert.equal(calls.length, 0);
});

test("wallet and cancellation dispatch using the same scoped credential", async () => {
  const { handler, calls } = setup();
  const orderId = "33333333-3333-4333-a333-333333333333";
  await handler(request("tools/call", { name: "get_wallet", arguments: {} }));
  await handler(request("tools/call", { name: "cancel_order", arguments: { orderId } }));
  assert.deepEqual(
    calls.map((c) => [c.path, c.key]),
    [
      ["wallet", "Bearer nm_first"],
      [`orders/${orderId}/cancel`, "Bearer nm_first"],
    ],
  );
});
