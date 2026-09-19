import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// An external buyer only needs this HTTP client and its company credential.
export async function delegate({ baseUrl, key, payload, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(base.hostname))
    throw new Error("Use HTTPS para transmitir a credencial da empresa.");
  async function request(path, options = {}) {
    const response = await fetchImpl(new URL(path, base), {
      ...options,
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    });
    if (!response.ok)
      throw new Error(`API ${response.status}: consulte o pedido antes de repetir.`);
    return response;
  }
  const response = await request("/api/a2a/missions", {
    method: "POST",
    body: JSON.stringify({ ...payload, humanReview: true }),
  });
  const detail = await response.json();
  const delivery = detail.deliveries.find(
    (d) => d.version === detail.order.current_delivery_version,
  );
  if (!delivery) return { detail, artifact: null };
  const file = await request(
    `/api/a2a/orders/${encodeURIComponent(detail.order.id)}/deliveries/${encodeURIComponent(delivery.id)}`,
  );
  const artifact = await file.text();
  const hash = createHash("sha256").update(artifact).digest("hex");
  if (hash !== delivery.sha256 || hash !== file.headers.get("X-Content-SHA256"))
    throw new Error("O arquivo recebido não corresponde à entrega verificada.");
  return { detail, artifact };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const inputPath = process.argv[2];
    if (!inputPath || !process.env.NM_AGENT_KEY)
      throw new Error("Defina NM_AGENT_KEY e execute: node scripts/buyer-agent.mjs pedido.json");
    const payload = JSON.parse(await readFile(inputPath, "utf8"));
    if (!payload.requestId) {
      payload.requestId = randomUUID();
      // Persist before any request so network retries never create another purchase.
      await writeFile(inputPath, JSON.stringify(payload, null, 2) + "\n");
    }
    const { detail, artifact } = await delegate({
      baseUrl: process.env.NM_BASE_URL || "https://market-agent-sync.lovable.app",
      key: process.env.NM_AGENT_KEY,
      payload,
    });
    if (artifact !== null)
      await writeFile(`${inputPath}.delivery.${payload.task ? "json" : "csv"}`, artifact);
    console.log(
      JSON.stringify(
        {
          orderId: detail.order.id,
          status: detail.order.status,
          action:
            detail.order.status === "accepted"
              ? "Abra Pedidos no estúdio para revisar e aceitar a entrega."
              : "Consulte o pedido no estúdio.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
