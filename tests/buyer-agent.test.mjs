import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { delegate } from "../scripts/buyer-agent.mjs";
const artifact = "sku,size,priceCents\nA,M,100\n";
const sha = createHash("sha256").update(artifact).digest("hex");
const detail = {
  order: { id: "order", status: "accepted", current_delivery_version: 1 },
  deliveries: [{ id: "delivery", version: 1, sha256: sha }],
};
test("external buyer preserves request identity, requires human review and validates delivered bytes", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, ...init });
    return url.pathname.endsWith("missions")
      ? Response.json(detail)
      : new Response(artifact, { headers: { "X-Content-SHA256": sha } });
  };
  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload: { requestId: "stable", humanReview: false },
    fetchImpl,
  });
  assert.equal(result.artifact, artifact);
  assert.deepEqual(JSON.parse(calls[0].body), { requestId: "stable", humanReview: true });
  assert.equal(calls[1].path, "/api/a2a/orders/order/deliveries/delivery");
  assert.equal(calls[0].redirect, "error");
});
test("external buyer rejects a substituted artifact and insecure credential transport", async () => {
  await assert.rejects(
    delegate({ baseUrl: "http://market.test", key: "fake", payload: {} }),
    /HTTPS/,
  );
  await assert.rejects(
    delegate({
      baseUrl: "https://market.test",
      key: "fake",
      payload: {},
      fetchImpl: async (url) =>
        url.pathname.endsWith("missions")
          ? Response.json(detail)
          : new Response("tampered", { headers: { "X-Content-SHA256": sha } }),
    }),
    /não corresponde/,
  );
});
