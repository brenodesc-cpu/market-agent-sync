import { z } from "zod";
import { orderRequestSchema } from "./a2a-contract";
import {
  authenticateAgent,
  catalogueOffers,
  createOrder,
  orderDetails,
  runOrder,
  rpc,
} from "./studio-runtime.server";

export async function handleAgentApi(request: Request, path: string) {
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (path === "offers" && request.method === "GET") {
    try {
      return json({ offers: await catalogueOffers() });
    } catch {
      return json({ error: "marketplace_unavailable" }, 503);
    }
  }
  let actor;
  try {
    actor = await authenticateAgent(request);
  } catch {
    return json({ error: "invalid_agent_credential" }, 401);
  }
  try {
    if ((path === "orders" || path === "missions") && request.method === "POST") {
      const text = await limitedBody(request);
      const data = orderRequestSchema.parse({
        ...JSON.parse(text),
        buyerCompanyId: actor.companyId,
      });
      const created = await createOrder(actor.userId, data);
      if (path === "missions") return json(await runOrder(actor.userId, created.orderId), 201);
      // The agent calls /run separately so a disconnected caller can resume safely.
      return json({ ...created, next: `/api/a2a/orders/${created.orderId}/run` }, 201);
    }
    const match = /^orders\/([^/]+)(?:\/(run|cancel|deliveries)(?:\/([^/]+))?)?$/.exec(path);
    if (!match) return json({ error: "not_found" }, 404);
    const orderId = z.string().uuid().parse(match[1]);
    const detail = await orderDetails(actor.userId, orderId, actor.companyId);
    if (!match[2] && request.method === "GET") return json(detail);
    if (match[2] === "deliveries" && request.method === "GET") {
      const delivery = detail.deliveries.find((d) => d.id === match[3]);
      if (!delivery?.artifact_content) return json({ error: "artifact_not_found" }, 404);
      return new Response(delivery.artifact_content, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="catalogo-v${delivery.version}.csv"`,
          "Cache-Control": "no-store",
          "X-Content-SHA256": delivery.sha256,
        },
      });
    }
    if (detail.order.buyer_company_id !== actor.companyId)
      return json({ error: "buyer_permission_required" }, 403);
    if (match[2] === "run" && request.method === "POST")
      return json(await runOrder(actor.userId, orderId));
    if (match[2] === "cancel" && request.method === "POST")
      return json(await rpc("studio_cancel_order", { _user: actor.userId, _order: orderId }));
    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json(
        { error: "invalid_request", message: "Confira o formato e os campos obrigatórios." },
        400,
      );
    const message = error instanceof Error ? error.message : "";
    if (/indisponível|escopo|access_denied/i.test(message))
      return json({ error: "order_not_found" }, 404);
    return json(
      {
        error: "operation_not_completed",
        message:
          /orçamento|saldo|duplicados|fornecedor|revision_limit|deadline|already_settled|idempotency/.test(
            message,
          )
            ? message
            : "A operação não foi concluída; consulte o pedido antes de tentar novamente.",
      },
      409,
    );
  }
}
async function limitedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("empty_body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 262144) {
      await reader.cancel();
      throw new SyntaxError("body_too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
