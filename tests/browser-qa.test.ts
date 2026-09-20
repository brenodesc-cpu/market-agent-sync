import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { browserQuote, browserPurchaseSchema } from "../src/lib/browser-qa.ts";
import { auditBrowserEvidence } from "../src/lib/browser-audit.server.ts";
function evidence() {
  const samples = ["desktop", "mobile"].map((viewport) => {
    const width = viewport === "desktop" ? 1280 : 390,
      height = viewport === "desktop" ? 800 : 844;
    const bytes = Buffer.alloc(120);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return {
      viewport,
      width,
      height,
      url: "https://example.com/qa-fixture",
      submitted: true,
      outcome: "success",
      finding: "Envio confirmado",
      screenshot: bytes.toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      durationMs: 400,
    };
  });
  return { version: 1, orderId: randomUUID(), token: randomUUID(), samples };
}
test("quote filters required capability before price and never spends above budget", () => {
  assert.equal(browserQuote(14).selectedOffer, null);
  assert.equal(browserQuote(20).price, 15);
  assert.equal(browserQuote(20).offers[0].eligible, false);
  assert.equal(
    browserPurchaseSchema.safeParse({ requestId: randomUUID(), budget: -1 }).success,
    false,
  );
});
test("missing mobile blocks payment even when desktop evidence is valid", () => {
  const e = evidence();
  e.samples.pop();
  const r = auditBrowserEvidence(e, e.orderId, e.token);
  assert.equal(r.decision, "rejected");
  assert.equal(r.checks.find((c) => c.criterion === "mobile")?.status, "failed");
});
test("changed bytes, wrong lease or fake dimensions never pass", () => {
  const e = evidence();
  assert.equal(auditBrowserEvidence(e, e.orderId, randomUUID()).decision, "rejected");
  e.samples[0].screenshot = Buffer.alloc(120).toString("base64");
  assert.equal(auditBrowserEvidence(e, e.orderId, e.token).decision, "rejected");
  const other = evidence();
  other.samples[0].width = 390;
  assert.equal(auditBrowserEvidence(other, other.orderId, other.token).decision, "rejected");
});
test("a discovered site bug is a valid QA result when both test evidences are present", () => {
  const e = evidence();
  e.samples[1].outcome = "bug";
  e.samples[1].finding = "O envio não mostrou a confirmação esperada.";
  assert.equal(auditBrowserEvidence(e, e.orderId, e.token).decision, "approved");
});
test("duplicate desktop cannot replace mobile, unrelated page rejected", () => {
  const e = evidence();
  e.samples[1] = e.samples[0];
  assert.equal(auditBrowserEvidence(e, e.orderId, e.token).decision, "rejected");
  const e2 = evidence();
  e2.samples[1].url = "https://example.com/private";
  assert.equal(auditBrowserEvidence(e2, e2.orderId, e2.token).decision, "rejected");
});
