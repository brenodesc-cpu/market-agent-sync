import { z } from "zod";
import { orderRequestSchema } from "./a2a-contract.ts";
import {
  authenticateAgent,
  catalogueOffers,
  createOrder,
  orderDetails,
  runOrder,
  rpc,
} from "./studio-runtime.server.ts";
import {
  advanceAutonomousChain,
  getAutonomousChainStatus,
  startAutonomousChain,
} from "./agent-studio.server.ts";

const missionRequestSchema = z.object({
  requestId: z.string().uuid(),
  task: z.string().trim().min(10).max(6000),
  budget: z.number().int().min(1).max(10000),
});

type MissionSnapshot = NonNullable<Awaited<ReturnType<typeof getAutonomousChainStatus>>>;
type StartedMissionSnapshot = Awaited<ReturnType<typeof startAutonomousChain>>;
type AgentApiDependencies = {
  authenticateAgent: typeof authenticateAgent;
  catalogueOffers: typeof catalogueOffers;
  createOrder: typeof createOrder;
  orderDetails: typeof orderDetails;
  runOrder: typeof runOrder;
  rpc: typeof rpc;
  startAutonomousChain: (
    userId: string,
    companyId: string,
    requestId: string,
    task: string,
    budget: number,
  ) => Promise<StartedMissionSnapshot>;
  getAutonomousChainStatus: (
    userId: string,
    companyId: string,
    requestId: string,
  ) => Promise<MissionSnapshot | null>;
  advanceAutonomousChain: (
    userId: string,
    companyId: string,
    requestId: string,
  ) => Promise<MissionSnapshot>;
};

const defaultDependencies: AgentApiDependencies = {
  authenticateAgent,
  catalogueOffers,
  createOrder,
  orderDetails,
  runOrder,
  rpc,
  startAutonomousChain,
  getAutonomousChainStatus,
  advanceAutonomousChain,
};

function missionLinks(requestId: string) {
  return {
    self: `/api/a2a/missions/${requestId}`,
    advance: `/api/a2a/missions/${requestId}/advance`,
  };
}

function orderReviewUrl(orderId: string, companyId: string) {
  return `/studio?view=orders&company=${encodeURIComponent(companyId)}&orderId=${encodeURIComponent(orderId)}`;
}

function activeLease(snapshot: MissionSnapshot, now = Date.now()) {
  return (
    (snapshot.status === "planning" || snapshot.status === "running") &&
    Boolean(snapshot.leaseUntil) &&
    Date.parse(snapshot.leaseUntil!) > now
  );
}

function hardFailure(message: string | null) {
  return Boolean(
    message &&
    /inicie uma nova missão|não cobre (esta etapa|um crédito)|não permite contratar|capacidade indisponível|dependência ausente/i.test(
      message,
    ),
  );
}

function publicMissionSnapshot(snapshot: MissionSnapshot) {
  const leaseActive = activeLease(snapshot);
  const retryable = snapshot.status === "failed" && !hardFailure(snapshot.errorMessage);
  const terminal = snapshot.status === "completed" || (snapshot.status === "failed" && !retryable);
  const steps = snapshot.steps.map((step, index) => {
    const details = step.order;
    const currentDelivery = details?.deliveries.find(
      (delivery) => delivery.version === details.order.current_delivery_version,
    );
    const verification = currentDelivery
      ? details?.reports.find(
          (report) =>
            report.delivery_id === currentDelivery.id ||
            report.delivery_version === currentDelivery.version,
        )
      : undefined;
    const orderId = details?.order.id ?? null;
    return {
      position: index + 1,
      status: step.status,
      role: step.role,
      source: step.source,
      provider: step.provider,
      budgetCap: step.budgetCap,
      orderId,
      price: details?.contract.price_units ?? null,
      verification: verification ? { decision: verification.decision } : null,
      delivery: currentDelivery
        ? {
            id: currentDelivery.id,
            version: currentDelivery.version,
            sha256: currentDelivery.sha256,
            downloadUrl: `/api/a2a/orders/${orderId}/deliveries/${currentDelivery.id}`,
          }
        : null,
      reviewUrl: orderId ? orderReviewUrl(orderId, details!.order.buyer_company_id) : null,
      errorMessage: step.status === "failed" ? "A etapa não foi concluída." : null,
    };
  });
  const pendingReviews = snapshot.steps.flatMap((sourceStep, index) => {
    const step = steps[index]!;
    return sourceStep.status === "awaiting_review" &&
      sourceStep.order?.order.status !== "settled" &&
      step.orderId
      ? [
          {
            step: step.position,
            orderId: step.orderId,
            provider: step.provider,
            price: step.price,
            reviewUrl: step.reviewUrl!,
          },
        ]
      : [];
  });
  const nextAction = leaseActive
    ? "wait"
    : snapshot.status === "awaiting_review" && pendingReviews.length
      ? "review"
      : snapshot.status === "completed"
        ? "done"
        : snapshot.status === "failed" && !retryable
          ? "restart"
          : "advance";
  return {
    missionId: snapshot.missionId,
    requestId: snapshot.requestId,
    status: snapshot.status,
    terminal,
    retryable,
    nextAction,
    leaseUntil: snapshot.leaseUntil,
    completedSteps: steps.filter(
      (step) => step.status === "completed" || step.status === "awaiting_review",
    ).length,
    totalSteps: steps.length,
    initialBudget: snapshot.initialBudget,
    remainingBudget: snapshot.remainingBudget,
    blockedTools: snapshot.blockedTools,
    pendingReviews,
    steps,
    links: missionLinks(snapshot.requestId),
  };
}

function retryAfterSeconds(snapshot: MissionSnapshot) {
  const remaining = Date.parse(snapshot.leaseUntil ?? "") - Date.now();
  return String(Math.max(1, Math.ceil(remaining / 1000)));
}

export function createAgentApiHandler(overrides: Partial<AgentApiDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return async function handle(request: Request, path: string) {
    const json = (data: unknown, status = 200, headers?: Record<string, string>) =>
      Response.json(data, {
        status,
        headers: { "Cache-Control": "no-store", ...headers },
      });

    if (path === "offers" && request.method === "GET") {
      try {
        return json({ offers: await dependencies.catalogueOffers() });
      } catch {
        return json({ error: "marketplace_unavailable" }, 503);
      }
    }

    let actor;
    try {
      actor = await dependencies.authenticateAgent(request);
    } catch {
      return json({ error: "invalid_agent_credential" }, 401);
    }

    try {
      if (path === "connection" && request.method === "GET") {
        return json({
          connected: true,
          companyId: actor.companyId,
          currency: "simulated_credits",
          permissions: ["discover", "quote", "hire", "track"],
          spendingPolicy: "Saldo da empresa e orçamento de cada contratação.",
          humanApprovalRequired: true,
        });
      }
      const browserRetry = /^browser\/orders\/([a-f0-9-]{36})\/retry$/.exec(path);
      if (browserRetry && request.method === "POST") {
        await dependencies.orderDetails(actor.userId, browserRetry[1]!, actor.companyId);
        return json(
          await (
            await import("./browser-runtime.server.ts")
          ).retryBrowserTest(actor.userId, browserRetry[1]!),
        );
      }
      if (path === "browser/quote" && request.method === "POST") {
        const { browserQuote } = await import("./browser-qa.ts");
        const input = z
          .object({ budget: z.number().int().min(1).max(1000) })
          .parse(JSON.parse(await limitedBody(request)));
        return json(browserQuote(input.budget));
      }
      if (path === "browser/orders" && request.method === "POST") {
        const { purchaseBrowserTest } = await import("./browser-runtime.server.ts");
        const payload = JSON.parse(await limitedBody(request));
        const result = await purchaseBrowserTest(actor.userId, actor.companyId, {
          ...payload,
          source: "mcp",
        });
        return json(
          {
            ...result,
            reviewUrl: `/studio?view=advisor&orderId=${result.orderId}`,
            next: `/api/a2a/orders/${result.orderId}`,
          },
          201,
        );
      }
      if (path === "missions" && request.method === "POST") {
        const input = missionRequestSchema.parse(JSON.parse(await limitedBody(request)));
        const snapshot = await dependencies.startAutonomousChain(
          actor.userId,
          actor.companyId,
          input.requestId,
          input.task,
          input.budget,
        );
        return json(publicMissionSnapshot(snapshot), snapshot.created ? 201 : 200, {
          Location: `/api/a2a/missions/${input.requestId}`,
        });
      }

      if (path === "orders" && request.method === "POST") {
        const text = await limitedBody(request);
        const data = orderRequestSchema.parse({
          ...JSON.parse(text),
          buyerCompanyId: actor.companyId,
          humanReview: true,
        });
        const created = await dependencies.createOrder(actor.userId, data);
        return json(
          {
            ...created,
            next: `/api/a2a/orders/${created.orderId}/run`,
            reviewUrl: orderReviewUrl(created.orderId, actor.companyId),
          },
          201,
        );
      }

      const missionMatch = /^missions\/([^/]+)(?:\/(advance))?$/.exec(path);
      if (missionMatch) {
        const requestId = z.string().uuid().parse(missionMatch[1]);
        const current = await dependencies.getAutonomousChainStatus(
          actor.userId,
          actor.companyId,
          requestId,
        );
        if (!current) return json({ error: "mission_not_found" }, 404);

        if (!missionMatch[2] && request.method === "GET")
          return json(publicMissionSnapshot(current));

        if (missionMatch[2] === "advance" && request.method === "POST") {
          if (activeLease(current))
            return json(publicMissionSnapshot(current), 202, {
              "Retry-After": retryAfterSeconds(current),
            });
          if (current.status === "completed") return json(publicMissionSnapshot(current));
          const currentPublic = publicMissionSnapshot(current);
          if (current.status === "awaiting_review" && currentPublic.pendingReviews.length)
            return json(currentPublic);
          if (current.status === "failed" && !currentPublic.retryable) return json(currentPublic);

          const snapshot = await dependencies.advanceAutonomousChain(
            actor.userId,
            actor.companyId,
            requestId,
          );
          if (activeLease(snapshot))
            return json(publicMissionSnapshot(snapshot), 202, {
              "Retry-After": retryAfterSeconds(snapshot),
            });
          return json(publicMissionSnapshot(snapshot));
        }

        return json({ error: "method_not_allowed" }, 405);
      }

      const match = /^orders\/([^/]+)(?:\/(run|cancel|deliveries)(?:\/([^/]+))?)?$/.exec(path);
      if (!match) return json({ error: "not_found" }, 404);
      const orderId = z.string().uuid().parse(match[1]);
      const detail = await dependencies.orderDetails(actor.userId, orderId, actor.companyId);
      if (!match[2] && request.method === "GET") {
        if (detail.contract.offer_version_id === "00000000-0000-0000-0000-000000002302") {
          return json({
            ...detail,
            reviewUrl: `/studio?view=advisor&orderId=${orderId}`,
            deliveries: detail.deliveries.map(({ artifact_content, ...delivery }) => ({
              ...delivery,
              downloadUrl: `/api/a2a/orders/${orderId}/deliveries/${delivery.id}`,
              // Binary evidence is downloadable; do not spend the buyer's context on base64.
              samples: artifact_content
                ? JSON.parse(artifact_content).samples.map(
                    ({ screenshot, ...sample }: { screenshot: string; [key: string]: unknown }) =>
                      sample,
                  )
                : [],
            })),
          });
        }
        return json(detail);
      }
      if (match[2] === "deliveries" && request.method === "GET") {
        const delivery = detail.deliveries.find((item) => item.id === match[3]);
        if (!delivery?.artifact_content) return json({ error: "artifact_not_found" }, 404);
        return new Response(delivery.artifact_content, {
          headers: {
            "Content-Type":
              delivery.media_type === "application/json"
                ? "application/json; charset=utf-8"
                : "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="entrega-v${delivery.version}.${delivery.media_type === "application/json" ? "json" : "csv"}"`,
            "Cache-Control": "no-store",
            "X-Content-SHA256": delivery.sha256,
          },
        });
      }
      if (detail.order.buyer_company_id !== actor.companyId)
        return json({ error: "buyer_permission_required" }, 403);
      if (match[2] === "run" && request.method === "POST")
        return json(await dependencies.runOrder(actor.userId, orderId));
      if (match[2] === "cancel" && request.method === "POST")
        return json(
          await dependencies.rpc("studio_cancel_order", {
            _user: actor.userId,
            _order: orderId,
          }),
        );
      return json({ error: "method_not_allowed" }, 405);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "body_too_large") return json({ error: "body_too_large" }, 413);
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return json(
          { error: "invalid_request", message: "Confira o formato e os campos obrigatórios." },
          400,
        );
      if (/Missão não encontrada|mission_access_denied/i.test(message))
        return json({ error: "mission_not_found" }, 404);
      if (/NeuraLake|IA não retornou|gestor não conseguiu|provedor/i.test(message))
        return json({ error: "provider_unavailable", message }, 503);
      if (
        /inviável|dependência|ferramenta|capacidade indisponível|saldo disponível|orçamento não cobre|não permite contratar/i.test(
          message,
        )
      )
        return json({ error: "mission_not_feasible", message }, 422);
      if (/Pedido.*indisponível|especialista.*indisponível|escopo|access_denied/i.test(message))
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
  };
}

export const handleAgentApi = createAgentApiHandler();

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
