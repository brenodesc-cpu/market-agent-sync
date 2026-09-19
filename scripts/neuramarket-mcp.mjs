#!/usr/bin/env node
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod-mcp";

const MAX_DELIVERY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 70_000;

export class NeuraMarketApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "NeuraMarketApiError";
    this.status = status;
    this.code = code;
  }
}

export function readNeuraMarketConfig(env = process.env) {
  const rawBaseUrl = env.NM_BASE_URL?.trim();
  const agentKey = env.NM_AGENT_KEY?.trim();
  if (!rawBaseUrl) throw new Error("Defina NM_BASE_URL para conectar o MCP à NeuraMarket.");
  if (!agentKey) throw new Error("Defina NM_AGENT_KEY para autenticar a empresa na NeuraMarket.");
  const baseUrl = new URL(rawBaseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !(local && baseUrl.protocol === "http:"))
    throw new Error("NM_BASE_URL precisa usar HTTPS, exceto em desenvolvimento local.");
  baseUrl.hash = "";
  baseUrl.search = "";
  baseUrl.pathname = baseUrl.pathname.replace(/\/$/, "");
  return { baseUrl, agentKey };
}

function safeApiMessage(value, fallback, secrets = []) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  let message = value.replace(/[\r\n\t]+/g, " ").slice(0, 300);
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[redacted]");
  return message;
}

export class NeuraMarketClient {
  constructor({ baseUrl, agentKey, fetchImpl = fetch }) {
    this.baseUrl = baseUrl instanceof URL ? new URL(baseUrl) : new URL(baseUrl);
    this.agentKey = agentKey;
    this.fetchImpl = fetchImpl;
  }

  apiUrl(path) {
    return new URL(`/api/a2a/${path.replace(/^\//, "")}`, this.baseUrl);
  }

  absoluteLinks(value, key = "") {
    if (Array.isArray(value)) return value.map((item) => this.absoluteLinks(item, key));
    if (!value || typeof value !== "object") {
      const linkKey =
        key === "reviewUrl" ||
        key === "downloadUrl" ||
        key === "next" ||
        key === "self" ||
        key === "advance";
      return linkKey && typeof value === "string" && value.startsWith("/")
        ? new URL(value, this.baseUrl).href
        : value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        this.absoluteLinks(entryValue, entryKey),
      ]),
    );
  }

  async request(path, init = {}) {
    const response = await this.fetchImpl(this.apiUrl(path), {
      ...init,
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.agentKey}`,
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => ({
      error: "invalid_response",
      message: "A API devolveu uma resposta inválida.",
    }));
    if (!response.ok) {
      const code = typeof payload?.error === "string" ? payload.error : "request_failed";
      throw new NeuraMarketApiError(
        response.status,
        code,
        safeApiMessage(payload?.message, `A NeuraMarket recusou a operação (${response.status}).`, [
          this.agentKey,
        ]),
      );
    }
    return this.absoluteLinks(payload);
  }

  listAgents() {
    return this.request("offers");
  }

  startMission({ requestId, task, budget }) {
    return this.request("missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, task, budget }),
    });
  }

  getMission(requestId) {
    return this.request(`missions/${encodeURIComponent(requestId)}`);
  }

  advanceMission(requestId) {
    return this.request(`missions/${encodeURIComponent(requestId)}/advance`, { method: "POST" });
  }

  hireAgent({ requestId, offerVersionId, title, task, budget }) {
    return this.request("orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, offerVersionId, title, task, budget }),
    });
  }

  getOrder(orderId) {
    return this.request(`orders/${encodeURIComponent(orderId)}`);
  }

  runOrder(orderId) {
    return this.request(`orders/${encodeURIComponent(orderId)}/run`, { method: "POST" });
  }

  async downloadAndVerifyDelivery({ downloadUrl, sha256 }) {
    const url = new URL(downloadUrl, this.baseUrl);
    if (url.origin !== this.baseUrl.origin)
      throw new Error("A entrega precisa pertencer ao mesmo servidor configurado em NM_BASE_URL.");
    const response = await this.fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${this.agentKey}` },
    });
    if (!response.ok)
      throw new NeuraMarketApiError(
        response.status,
        "delivery_download_failed",
        `Não foi possível baixar a entrega (${response.status}).`,
      );
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_DELIVERY_BYTES)
      throw new Error("A entrega excede o limite de 1 MB do adaptador MCP.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_DELIVERY_BYTES)
      throw new Error("A entrega excede o limite de 1 MB do adaptador MCP.");
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    const expectedSha256 = sha256.toLowerCase();
    const headerSha256 = response.headers.get("x-content-sha256")?.toLowerCase() ?? "";
    if (actualSha256 !== expectedSha256 || headerSha256 !== expectedSha256)
      throw new NeuraMarketApiError(
        422,
        "delivery_hash_mismatch",
        "A entrega baixada ou seu cabeçalho não corresponde ao SHA-256 registrado.",
      );
    return {
      verified: true,
      expectedSha256,
      actualSha256,
      byteSize: bytes.byteLength,
      mediaType: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
      content: new TextDecoder().decode(bytes),
    };
  }
}

function successfulToolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function failedToolResult(error) {
  const code = error instanceof NeuraMarketApiError ? error.code : "mcp_adapter_error";
  const message = error instanceof Error ? error.message : "A operação não foi concluída.";
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: code, message }) }],
  };
}

function guarded(handler) {
  return async (input) => {
    try {
      return successfulToolResult(await handler(input));
    } catch (error) {
      return failedToolResult(error);
    }
  };
}

export function createNeuraMarketToolHandlers(client) {
  return {
    listAgents: guarded(() => client.listAgents()),
    startMission: guarded((input) => client.startMission(input)),
    getMission: guarded(({ requestId }) => client.getMission(requestId)),
    advanceMission: guarded(({ requestId }) => client.advanceMission(requestId)),
    hireAgent: guarded((input) => client.hireAgent(input)),
    getOrder: guarded(({ orderId }) => client.getOrder(orderId)),
    runOrder: guarded(({ orderId }) => client.runOrder(orderId)),
    downloadAndVerifyDelivery: guarded((input) => client.downloadAndVerifyDelivery(input)),
  };
}

export function createNeuraMarketMcpServer(options = {}) {
  const config = options.config ?? readNeuraMarketConfig();
  const client =
    options.client ?? new NeuraMarketClient({ ...config, fetchImpl: options.fetchImpl });
  const tools = createNeuraMarketToolHandlers(client);
  const server = new McpServer({ name: "neuramarket-a2a", version: "1.0.0" });

  server.registerTool(
    "list_agents",
    {
      title: "Listar agentes",
      description: "Lista agentes comerciais disponíveis no marketplace da NeuraMarket.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tools.listAgents,
  );
  server.registerTool(
    "start_mission",
    {
      title: "Iniciar missão A2A",
      description:
        "Cria uma missão para a empresa autenticada. Reutilize requestId ao repetir a mesma solicitação.",
      inputSchema: z.object({
        requestId: z.uuid().describe("UUID idempotente. Reutilize-o em toda repetição."),
        task: z.string().min(10).max(6000).describe("Objetivo completo que a rede deve cumprir."),
        budget: z.int().min(1).max(10000).describe("Teto total em créditos simulados."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    tools.startMission,
  );
  server.registerTool(
    "get_mission",
    {
      title: "Consultar missão",
      description: "Consulta o estado persistido, etapas, revisões e próxima ação de uma missão.",
      inputSchema: z.object({ requestId: z.uuid() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tools.getMission,
  );
  server.registerTool(
    "advance_mission",
    {
      title: "Avançar missão",
      description:
        "Executa no máximo o planejamento ou uma etapa. Após timeout ou resposta perdida, consulte get_mission antes de repetir. Pare quando nextAction for wait, review, done ou restart.",
      inputSchema: z.object({ requestId: z.uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    tools.advanceMission,
  );
  server.registerTool(
    "hire_agent",
    {
      title: "Contratar agente específico",
      description:
        "Contrata uma versão de oferta escolhida em list_agents, dentro do orçamento da empresa autenticada.",
      inputSchema: z.object({
        requestId: z.uuid().describe("UUID idempotente. Reutilize-o em toda repetição."),
        offerVersionId: z.uuid().describe("ID da versão devolvido por list_agents."),
        title: z.string().min(3).max(120),
        task: z.string().min(10).max(12000),
        budget: z.int().min(1).max(10000),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    tools.hireAgent,
  );
  server.registerTool(
    "get_order",
    {
      title: "Consultar pedido",
      description: "Consulta contrato, entregas e verificação de um pedido da empresa autenticada.",
      inputSchema: z.object({ orderId: z.uuid() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tools.getOrder,
  );
  server.registerTool(
    "run_order",
    {
      title: "Executar ou retomar pedido",
      description:
        "Executa ou retoma a contratação direta. Pode ser repetido com o mesmo orderId após uma interrupção.",
      inputSchema: z.object({ orderId: z.uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    tools.runOrder,
  );
  server.registerTool(
    "download_and_verify_delivery",
    {
      title: "Baixar e verificar entrega",
      description:
        "Baixa uma entrega indicada pela missão e compara seus bytes com o SHA-256 registrado.",
      inputSchema: z.object({
        downloadUrl: z.string().min(1).describe("downloadUrl devolvida em uma etapa da missão."),
        sha256: z
          .string()
          .regex(/^[a-fA-F0-9]{64}$/)
          .describe("SHA-256 esperado da entrega."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    tools.downloadAndVerifyDelivery,
  );

  return server;
}

export function startNeuraMarketMcp() {
  const config = readNeuraMarketConfig();
  const handle = serveStdio(() => createNeuraMarketMcpServer({ config }));
  console.error("NeuraMarket MCP conectado por stdio.");
  process.on("SIGINT", () => void handle.close());
  process.on("SIGTERM", () => void handle.close());
  return handle;
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  try {
    startNeuraMarketMcp();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Não foi possível iniciar o MCP.");
    process.exitCode = 1;
  }
}
