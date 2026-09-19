import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MISSION_STATUSES = new Set(["planning", "running", "awaiting_review", "completed", "failed"]);
const MAX_STATUS_POLLS = 120;

function shouldStop(snapshot) {
  if (snapshot.status === "completed") return true;
  if (snapshot.status === "failed") return snapshot.retryable !== true;
  return (
    snapshot.status === "awaiting_review" &&
    (snapshot.nextAction === "review" ||
      (Array.isArray(snapshot.pendingReviews) && snapshot.pendingReviews.length > 0))
  );
}

export class AgentApiError extends Error {
  constructor(status, payload) {
    const code = typeof payload?.error === "string" ? payload.error : "api_error";
    const message =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : `API ${status}: ${code}`;
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.code = code;
  }
}

function retryAfterMilliseconds(response) {
  const value = response.headers.get("Retry-After");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

// An external buyer only needs this HTTP client and its company credential.
export async function delegate({
  baseUrl,
  key,
  payload,
  fetchImpl = fetch,
  maxIterations = 24,
  waitImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(base.hostname))
    throw new Error("Use HTTPS para transmitir a credencial da empresa.");
  if (!payload.requestId)
    throw new Error("Informe e persista um requestId antes de iniciar a missão.");
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 100)
    throw new Error("maxIterations deve ser um inteiro entre 1 e 100.");

  const missionPath = `/api/a2a/missions/${encodeURIComponent(payload.requestId)}`;

  async function request(path, options = {}) {
    const response = await fetchImpl(new URL(path, base), {
      ...options,
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      throw new AgentApiError(response.status, payload);
    }
    return response;
  }

  async function readSnapshot(response) {
    const snapshot = await response.json();
    if (
      !snapshot ||
      snapshot.requestId !== payload.requestId ||
      !MISSION_STATUSES.has(snapshot.status)
    )
      throw new Error("A API não devolveu um estado válido para esta missão.");
    return {
      snapshot,
      retryAfterMs: retryAfterMilliseconds(response),
    };
  }

  async function getSnapshot() {
    return readSnapshot(await request(missionPath, { method: "GET" }));
  }

  async function mutateOrRecover(path, options) {
    try {
      return await readSnapshot(await request(path, options));
    } catch (mutationError) {
      if (mutationError instanceof AgentApiError && mutationError.status < 500) throw mutationError;
      // Never repeat a mutation after an uncertain response. Its requestId makes GET authoritative.
      try {
        return await getSnapshot();
      } catch {
        throw mutationError;
      }
    }
  }

  let state = await mutateOrRecover("/api/a2a/missions", {
    method: "POST",
    body: JSON.stringify({
      requestId: payload.requestId,
      task: payload.task,
      budget: payload.budget,
    }),
  });

  let advances = 0;
  let statusPolls = 0;
  while (advances < maxIterations) {
    if (shouldStop(state.snapshot)) return state.snapshot;

    const leaseUntil = state.snapshot.leaseUntil ? Date.parse(state.snapshot.leaseUntil) : 0;
    const leaseDelay = Number.isFinite(leaseUntil) ? leaseUntil - Date.now() + 25 : 0;
    const waitFor = Math.max(state.retryAfterMs, leaseDelay);
    if (waitFor > 0) {
      if (statusPolls >= MAX_STATUS_POLLS) return state.snapshot;
      await waitImpl(waitFor);
      state = await getSnapshot();
      statusPolls++;
      continue;
    }

    state = await mutateOrRecover(`${missionPath}/advance`, { method: "POST" });
    advances++;
  }

  // The caller can persist this last observation and continue the same requestId later.
  return state.snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const inputPath = process.argv[2];
    if (!inputPath || !process.env.NM_AGENT_KEY)
      throw new Error("Defina NM_AGENT_KEY e execute: node scripts/buyer-agent.mjs pedido.json");
    const payload = JSON.parse(await readFile(inputPath, "utf8"));
    if (!payload.requestId) {
      payload.requestId = randomUUID();
      // Persist before any request so network retries never create another mission.
      await writeFile(inputPath, JSON.stringify(payload, null, 2) + "\n");
    }
    const snapshot = await delegate({
      baseUrl: process.env.NM_BASE_URL || "https://market-agent-sync.lovable.app",
      key: process.env.NM_AGENT_KEY,
      payload,
    });
    console.log(JSON.stringify(snapshot, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
