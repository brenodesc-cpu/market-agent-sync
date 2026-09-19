import test from "node:test";
import assert from "node:assert/strict";
import { createNeuraLakeClient, createVoiceHandler } from "../src/lib/review-voice.server.mjs";

const session = { ownerId: "buyer-01", reviewId: "review-01", expiresAt: Date.now() + 60000 };
const request = (token = "voice-session", body = {}) =>
  new Request("https://example.test/reviews/review-01/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Por que está bloqueado?" }],
      stream: true,
      ...body,
    }),
  });

test("voice session is limited to its review and cannot choose a user through request context", async () => {
  let reads = 0;
  const handle = createVoiceHandler({
    resolveSession: async (token) => (token === "voice-session" ? session : null),
    loadReview: async (id, owner) => {
      reads++;
      assert.equal(id, session.reviewId);
      assert.equal(owner, session.ownerId);
      return { status: "pending" };
    },
    answer: async () => "A entrega está pendente.",
  });
  assert.equal((await handle(request("wrong"), "review-01")).status, 401);
  assert.equal((await handle(request(), "another-review")).status, 401);
  assert.equal(reads, 0);
  const response = await handle(
    request("voice-session", { context: { userId: "another-buyer", reviewId: "another-review" } }),
    "review-01",
  );
  assert.equal(response.headers.get("Content-Type"), "text/event-stream");
  const output = await response.text();
  assert.match(output, /A entrega está pendente/);
  assert.match(output, /data: \[DONE\]/);
  assert.equal(reads, 1);
});

test("missing expiry, expired session, oversized body and malformed JSON fail closed", async () => {
  for (const expiresAt of [undefined, Date.now() - 1]) {
    const handle = createVoiceHandler({
      resolveSession: async () => ({ ...session, expiresAt }),
      loadReview: assert.fail,
      answer: assert.fail,
    });
    assert.equal((await handle(request(), "review-01")).status, 401);
  }
  const handle = createVoiceHandler({
    resolveSession: async () => session,
    loadReview: assert.fail,
    answer: assert.fail,
  });
  assert.equal(
    (await handle(request("voice-session", { excess: "x".repeat(40000) }), "review-01")).status,
    413,
  );
  const malformed = new Request("https://example.test", {
    method: "POST",
    headers: { Authorization: "Bearer voice-session" },
    body: "{",
  });
  assert.equal((await handle(malformed, "review-01")).status, 400);
});

test("NeuraLake adapter uses documented endpoint and receives current evidence without action tools", async () => {
  const review = {
    report: {
      status: "failed",
      checks: [{ id: "prices", status: "failed", message: "Preço alterado." }],
    },
    payment: { status: "reserved", mode: "simulated_credits" },
  };
  const answer = createNeuraLakeClient({
    apiKey: "local-test-only",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.neuralake.cloud/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer local-test-only");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "text");
      assert.equal(body.tools, undefined);
      assert.match(body.messages[1].content, /Preço alterado/);
      return Response.json({
        choices: [
          { message: { content: "O preço foi alterado. A aprovação continua bloqueada." } },
        ],
      });
    },
  });
  assert.match(await answer({ review, question: "Aprove mesmo assim." }), /bloqueada/);
  assert.equal(review.payment.status, "reserved");
});

test("provider failure returns an error without exposing secrets or claiming success", async () => {
  assert.throws(() => createNeuraLakeClient({ apiKey: "" }), /required/);
  const handle = createVoiceHandler({
    resolveSession: async () => session,
    loadReview: async () => ({}),
    answer: async () => {
      throw new Error("provider-secret-must-not-leak");
    },
  });
  const response = await handle(request(), "review-01");
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "review_explanation_unavailable" });
});
