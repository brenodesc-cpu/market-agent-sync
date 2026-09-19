import test from "node:test";
import assert from "node:assert/strict";
import { delegate } from "../scripts/buyer-agent.mjs";

const requestId = "11111111-1111-4111-8111-111111111111";
const payload = {
  requestId,
  title: "Campanha de lançamento",
  task: "Crie uma campanha completa para lançar um curso no Instagram.",
  budget: 30,
};

function snapshot(status, extra = {}) {
  return {
    missionId: "mission",
    requestId,
    status,
    terminal: ["completed", "awaiting_review", "failed"].includes(status),
    retryable: status === "planning" || status === "running",
    nextAction: status === "awaiting_review" ? "review" : status === "completed" ? null : "advance",
    leaseUntil: null,
    completedSteps: 0,
    totalSteps: 2,
    steps: [],
    pendingReviews: [],
    ...extra,
  };
}

test("external buyer starts once, advances serially and stops for human review", async () => {
  const calls = [];
  const states = [snapshot("planning"), snapshot("running"), snapshot("awaiting_review")];
  let activeRequests = 0;
  let concurrentRequests = 0;
  const fetchImpl = async (url, init) => {
    activeRequests++;
    concurrentRequests = Math.max(concurrentRequests, activeRequests);
    calls.push({ path: url.pathname, ...init });
    const value = states.shift();
    await Promise.resolve();
    activeRequests--;
    return Response.json(value, { status: calls.length === 1 ? 201 : 200 });
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
  });

  assert.equal(result.status, "awaiting_review");
  assert.equal(concurrentRequests, 1);
  assert.deepEqual(
    calls.map(({ path, method }) => [path, method]),
    [
      ["/api/a2a/missions", "POST"],
      [`/api/a2a/missions/${requestId}/advance`, "POST"],
      [`/api/a2a/missions/${requestId}/advance`, "POST"],
    ],
  );
  assert.deepEqual(JSON.parse(calls[0].body), {
    requestId,
    task: payload.task,
    budget: payload.budget,
  });
  assert.equal(calls[0].redirect, "error");
});

test("accepted review advances the same mission until its state is reconciled", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method });
    if (url.pathname === "/api/a2a/missions")
      return Response.json(
        snapshot("awaiting_review", {
          nextAction: "advance",
          pendingReviews: [],
        }),
      );
    return Response.json(snapshot("completed"));
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    calls.map(({ path, method }) => [path, method]),
    [
      ["/api/a2a/missions", "POST"],
      [`/api/a2a/missions/${requestId}/advance`, "POST"],
    ],
  );
});

test("retryable failure advances the same mission instead of abandoning it", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method });
    if (url.pathname === "/api/a2a/missions")
      return Response.json(snapshot("failed", { retryable: true, terminal: false }));
    return Response.json(snapshot("completed"));
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    calls.map(({ path, method }) => [path, method]),
    [
      ["/api/a2a/missions", "POST"],
      [`/api/a2a/missions/${requestId}/advance`, "POST"],
    ],
  );
});

test("uncertain mutations recover with GET and are never repeated", async () => {
  const calls = [];
  let runAttempted = false;
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method });
    if (url.pathname === "/api/a2a/missions") throw new Error("connection reset after commit");
    if (url.pathname.endsWith("/advance")) {
      runAttempted = true;
      throw new Error("response lost after execution");
    }
    if (init.method === "GET")
      return Response.json(snapshot(runAttempted ? "awaiting_review" : "planning"));
    throw new Error("unexpected call");
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
  });

  assert.equal(result.status, "awaiting_review");
  assert.equal(calls.filter(({ path }) => path === "/api/a2a/missions").length, 1);
  assert.equal(calls.filter(({ path }) => path.endsWith("/advance")).length, 1);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["POST", "GET", "POST", "GET"],
  );
});

test("definitive HTTP errors reach the caller without a recovery GET", async () => {
  const calls = [];
  for (const status of [400, 401, 403, 409, 413, 422]) {
    await assert.rejects(
      delegate({
        baseUrl: "https://market.test",
        key: "fake",
        payload,
        fetchImpl: async (url, init) => {
          calls.push({ path: url.pathname, method: init.method });
          return Response.json(
            { error: `http_${status}`, message: `Falha definitiva ${status}.` },
            { status },
          );
        },
      }),
      (error) => {
        assert.equal(error.status, status);
        assert.equal(error.code, `http_${status}`);
        assert.match(error.message, new RegExp(String(status)));
        return true;
      },
    );
  }

  assert.equal(calls.length, 6);
  assert.equal(
    calls.every(({ path }) => path === "/api/a2a/missions"),
    true,
  );
  assert.equal(
    calls.some(({ method }) => method === "GET"),
    false,
  );
});

test("advance 503 reads the committed retryable state before advancing again", async () => {
  const calls = [];
  let advances = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method });
    if (url.pathname === "/api/a2a/missions") return Response.json(snapshot("planning"));
    if (init.method === "GET")
      return Response.json(snapshot("failed", { retryable: true, terminal: false }));
    advances++;
    if (advances === 1)
      return Response.json(
        { error: "provider_unavailable", message: "O provedor falhou após salvar o estado." },
        { status: 503 },
      );
    return Response.json(snapshot("completed"));
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    calls.map(({ path, method }) => [path, method]),
    [
      ["/api/a2a/missions", "POST"],
      [`/api/a2a/missions/${requestId}/advance`, "POST"],
      [`/api/a2a/missions/${requestId}`, "GET"],
      [`/api/a2a/missions/${requestId}/advance`, "POST"],
    ],
  );
});

test("iteration limit returns the latest snapshot without an infinite loop", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method });
    return Response.json(snapshot(url.pathname.endsWith("/advance") ? "running" : "planning"));
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
    maxIterations: 3,
  });

  assert.equal(result.status, "running");
  assert.equal(calls.filter(({ path }) => path.endsWith("/advance")).length, 3);
  assert.equal(calls.length, 4);
});

test("waiting for a lease does not consume the advance limit", async () => {
  const calls = [];
  let statusReads = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method });
    if (url.pathname === "/api/a2a/missions")
      return Response.json(
        snapshot("running", { leaseUntil: new Date(Date.now() + 30_000).toISOString() }),
      );
    if (init.method === "GET") {
      statusReads++;
      return Response.json(snapshot("running"));
    }
    return Response.json(snapshot("completed"));
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
    maxIterations: 1,
    waitImpl: async () => {},
  });

  assert.equal(result.status, "completed");
  assert.equal(statusReads, 1);
  assert.deepEqual(
    calls.map(({ path, method }) => [path, method]),
    [
      ["/api/a2a/missions", "POST"],
      [`/api/a2a/missions/${requestId}`, "GET"],
      [`/api/a2a/missions/${requestId}/advance`, "POST"],
    ],
  );
});

test("Retry-After polling does not consume the next advance", async () => {
  const calls = [];
  let advances = 0;
  const waits = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method });
    if (url.pathname === "/api/a2a/missions") return Response.json(snapshot("planning"));
    if (init.method === "GET") return Response.json(snapshot("running"));
    advances++;
    if (advances === 1)
      return Response.json(snapshot("running"), {
        status: 202,
        headers: { "Retry-After": "2" },
      });
    return Response.json(snapshot("completed"));
  };

  const result = await delegate({
    baseUrl: "https://market.test",
    key: "fake",
    payload,
    fetchImpl,
    maxIterations: 2,
    waitImpl: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(waits, [2000]);
  assert.equal(calls.filter(({ path }) => path.endsWith("/advance")).length, 2);
  assert.equal(calls.filter(({ method }) => method === "GET").length, 1);
});

test("external buyer rejects insecure credential transport and missing request identity", async () => {
  await assert.rejects(delegate({ baseUrl: "http://market.test", key: "fake", payload }), /HTTPS/);
  await assert.rejects(
    delegate({
      baseUrl: "https://market.test",
      key: "fake",
      payload: { task: payload.task, budget: 30 },
    }),
    /requestId/,
  );
});
