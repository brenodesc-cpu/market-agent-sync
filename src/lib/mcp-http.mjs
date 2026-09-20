import { createMcpHandler } from "@modelcontextprotocol/server";
import { createNeuraMarketMcpServer, NeuraMarketClient } from "../../scripts/neuramarket-mcp.mjs";

// A fresh SDK server per request. Credentials and company state never cross requests.
export function createRemoteMcpHandler({ authenticate, handleApi }) {
  return async function handle(request) {
    const baseUrl = new URL(request.url);
    const reply = (error, status, headers = {}) =>
      Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
    const origin = request.headers.get("origin");
    if (origin && origin !== baseUrl.origin) return reply("origin_not_allowed", 403);
    if (!["POST", "GET", "DELETE"].includes(request.method))
      return reply("method_not_allowed", 405, { Allow: "POST, GET, DELETE" });
    try {
      await authenticate(request);
    } catch {
      return reply("invalid_agent_credential", 401, {
        "WWW-Authenticate": 'Bearer realm="NeuraMarket"',
      });
    }
    if (request.method !== "POST") return reply("stateless_endpoint", 405, { Allow: "POST" });
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
      return reply("json_required", 415);
    const reader = request.body?.getReader();
    if (!reader) return reply("empty_body", 400);
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return reply("body_too_large", 413);
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    try {
      JSON.parse(body);
    } catch {
      return reply("invalid_json", 400);
    }
    const key = request.headers.get("authorization").slice(7);
    const client = new NeuraMarketClient({
      baseUrl,
      agentKey: key,
      // Dispatch internally, never forward the key to an HTTP host supplied by the caller.
      fetchImpl: async (url, init) => {
        const target = new URL(url);
        if (target.origin !== baseUrl.origin || !target.pathname.startsWith("/api/a2a/"))
          throw new Error("Endpoint fora da API de agentes.");
        // This request stays inside the process. The edge runtime does not accept
        // redirect: "error" even when constructing a Request for internal dispatch.
        return handleApi(
          new Request(target, { ...init, redirect: "manual" }),
          target.pathname.slice("/api/a2a/".length),
        );
      },
    });
    const sdk = createMcpHandler(
      () => createNeuraMarketMcpServer({ config: { baseUrl, agentKey: key }, client }),
      {
        responseMode: "auto",
        maxSubscriptions: 0,
      },
    );
    const response = await sdk.fetch(
      new Request(request.url, { method: "POST", headers: request.headers, body }),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
