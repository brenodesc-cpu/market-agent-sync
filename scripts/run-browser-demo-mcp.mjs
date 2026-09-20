#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const configPath = process.argv[process.argv.indexOf("--config") + 1];
const orderId = process.argv.includes("--order")
  ? process.argv[process.argv.indexOf("--order") + 1]
  : undefined;
if (!process.argv.includes("--config") || !configPath) {
  throw new Error("Use --config com o arquivo baixado na tela da demo.");
}

const file = JSON.parse(await readFile(configPath, "utf8"));
const config = file?.mcpServers?.neuramarket;
const remote = process.argv.includes("--remote") || Boolean(config?.url);
if (config?.url) {
  config.env = {
    NM_BASE_URL: new URL(config.url).origin,
    NM_AGENT_KEY: config.headers?.Authorization?.replace(/^Bearer /, ""),
  };
}
if (!config?.env?.NM_BASE_URL || !config?.env?.NM_AGENT_KEY) {
  throw new Error("A configuração MCP da NeuraMarket está incompleta.");
}

const child = remote
  ? null
  : spawn(process.execPath, ["scripts/neuramarket-mcp.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NM_BASE_URL: config.env.NM_BASE_URL,
        NM_AGENT_KEY: config.env.NM_AGENT_KEY,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

let nextId = 1;
let stdout = "";
let stderr = "";
const pending = new Map();

async function send(method, params = {}) {
  const id = nextId++;
  if (remote) {
    const url = new URL("/api/mcp", config.env.NM_BASE_URL);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
      throw new Error("O MCP remoto precisa usar HTTPS.");
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(80000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${config.env.NM_AGENT_KEY}`,
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) throw new Error(`O MCP remoto respondeu HTTP ${response.status}.`);
    const text = await response.text();
    const message = response.headers.get("content-type")?.includes("text/event-stream")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => JSON.parse(line.slice(6)))
          .find((item) => item.id === id)
      : JSON.parse(text);
    if (!message || message.error)
      throw new Error(message?.error?.message ?? "Resposta MCP inválida.");
    return message.result;
  }
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`O MCP não respondeu a ${method}.`));
    }, 80_000);
    pending.set(id, { resolve, reject, timer });
  });
}

child?.stdout.setEncoding("utf8").on("data", (chunk) => {
  stdout += chunk;
  for (;;) {
    const newline = stdout.indexOf("\n");
    if (newline < 0) break;
    const line = stdout.slice(0, newline).trim();
    stdout = stdout.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) continue;
    clearTimeout(waiter.timer);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message ?? "Erro MCP."));
    else waiter.resolve(message.result);
  }
});
child?.stderr.setEncoding("utf8").on("data", (chunk) => {
  stderr += chunk.replaceAll(config.env.NM_AGENT_KEY, "[redacted]");
});

function data(result) {
  if (result?.isError) {
    const parsed = JSON.parse(result.content?.[0]?.text ?? "{}");
    throw new Error(parsed.message ?? parsed.error ?? "A ferramenta MCP falhou.");
  }
  return result?.structuredContent;
}

async function tool(name, args) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return data(await send("tools/call", { name, arguments: args }));
    } catch (error) {
      failure = error;
      if (!String(error?.message).includes("fetch failed") || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw failure;
}

async function poll(orderId, expected, timeoutMs = 80_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const order = await tool("get_order", { orderId });
    if (expected.includes(order.order.status)) return order;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`O pedido não chegou a ${expected.join("/")} no prazo.`);
}

try {
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "neuramarket-demo", version: "1" },
  });
  child?.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
  );

  if (process.argv.includes("--check")) {
    const status = await tool("connection_status", {});
    const list = await send("tools/list");
    process.stdout.write(
      `${JSON.stringify({ transport: remote ? "http" : "stdio", ...status, tools: list.tools.length }, null, 2)}\n`,
    );
  } else if (orderId) {
    const result = await tool("get_order", { orderId });
    process.stdout.write(
      `${JSON.stringify(
        {
          orderId,
          status: result.order.status,
          deliveryVersions: result.deliveries.length,
          reports: result.reports.map(({ delivery_version, decision }) => ({
            deliveryVersion: delivery_version,
            decision,
          })),
          humanReviews: result.humanReviews?.length ?? 0,
          reviewUrl: result.reviewUrl,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const quote = await tool("quote_browser_test", { budget: 20 });
    if (quote.selectedOffer === null || quote.price !== 15) {
      throw new Error("O assessor não selecionou a oferta completa de 15 créditos.");
    }
    const purchase = await tool("buy_browser_test", {
      requestId: randomUUID(),
      budget: 20,
      fixture: "lead-form-v1",
      testFailure: true,
    });
    const first = await poll(purchase.orderId, ["revision_requested"]);
    const firstReport = first.reports.at(-1);
    if (firstReport?.decision !== "rejected") {
      throw new Error("A auditoria não bloqueou a primeira entrega incompleta.");
    }

    await tool("retry_browser_test", { orderId: purchase.orderId });
    const corrected = await poll(purchase.orderId, ["accepted"]);
    const correctedReport = corrected.reports.at(-1);
    if (correctedReport?.decision !== "approved") {
      throw new Error("A auditoria não aprovou a correção completa.");
    }

    const summary = {
      orderId: purchase.orderId,
      selectedPrice: quote.price,
      rejectedVersion: first.order.current_delivery_version,
      correctedVersion: corrected.order.current_delivery_version,
      status: corrected.order.status,
      reviewUrl: corrected.reviewUrl,
      checks: correctedReport.checks.map(({ criterion, status }) => ({ criterion, status })),
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
} finally {
  child?.stdin.end();
  child?.kill("SIGTERM");
  if (stderr.trim()) process.stderr.write(stderr.slice(0, 2_000));
}
