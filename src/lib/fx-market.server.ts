import { z } from "zod";
import { rpc, runtimeDb, ownedCompany } from "./studio-runtime.server.ts";
import { neuralakeJson } from "./neuralake-json.server.ts";
import {
  fxGoalSchema,
  fxStartSchema,
  fxHireSchema,
  type FxQuote,
  type FxSnapshot,
} from "./fx-market.ts";
export async function quoteFx(userId: string, companyId: string, raw: unknown): Promise<FxQuote> {
  const input = fxGoalSchema.parse(raw);
  const quote = (await rpc("fx_quote", {
    _user: userId,
    _company: companyId,
    _request: input.requestId,
    _target: input.targetUsdCents,
    _budget: input.maxTotalBrlCents,
    _minutes: input.maxSettlementMinutes,
  })) as FxQuote;
  if (quote.inference) return quote;
  let inference: NonNullable<FxQuote["inference"]>;
  try {
    const output = await neuralakeJson(
      'Explique em português a seleção de câmbio deste simulador. Preços e seleção já foram calculados por regras. Não invente cotações, execução ou instituições reais. Retorne somente JSON {"summary":"explicação de até 350 caracteres sobre custo total e prazo"}.',
      { input, comparison: quote.data },
      "text",
      (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12000) }),
      400,
    );
    const summary = z.object({ summary: z.string().min(5).max(600) }).parse(output.value).summary;
    inference = {
      status: "completed",
      durationMs: output.durationMs,
      costUsd: null,
      pricingReference: "docs-neuralake.txt da equipe; USD estimado, não faturado",
      summary,
      requestedModel: "text",
      resolvedModel: output.resolvedModel,
      usage: output.usage,
      estimatedCostUsd:
        output.usage?.prompt_tokens != null && output.usage?.completion_tokens != null
          ? (output.usage.prompt_tokens * 0.15 + output.usage.completion_tokens * 0.6) / 1000000
          : null,
    };
  } catch {
    inference = {
      status: "unavailable",
      summary:
        "A explicação por IA está indisponível. A seleção usa a regra registrada de prazo e menor custo total.",
      requestedModel: "text",
      usage: null,
      estimatedCostUsd: null,
    };
  }
  const db = await runtimeDb();
  const saved = await db
    .from("fx_quotes")
    .update({ inference })
    .eq("id", quote.id)
    .eq("company_id", companyId)
    .is("inference", null);
  if (saved.error) throw Error("Não foi possível registrar a explicação da cotação.");
  const current = await db
    .from("fx_quotes")
    .select("*")
    .eq("id", quote.id)
    .eq("company_id", companyId)
    .single();
  if (current.error) throw Error("Não foi possível recuperar a cotação.");
  return current.data as FxQuote;
}
export async function getFx(
  userId: string,
  companyId: string,
  orderId?: string,
): Promise<FxSnapshot> {
  const id = orderId ? z.string().uuid().parse(orderId) : null;
  const result = (await rpc("fx_snapshot", {
    _user: userId,
    _company: companyId,
    _order: id,
  })) as FxSnapshot;
  return {
    ...result,
    ...(id ? { reviewUrl: `/studio?view=fx&company=${companyId}&orderId=${id}` } : {}),
  };
}
export async function advanceFx(
  userId: string,
  companyId: string,
  orderId: string,
  humanAccept = false,
): Promise<FxSnapshot> {
  z.string().uuid().parse(orderId);
  for (let i = 0; i < 7; i++) {
    const before = await getFx(userId, companyId, orderId);
    if (["settled", "cancelled", "expired"].includes(before.order!.status)) return before;
    if (
      before.order!.mode === "manual" &&
      ["rejected", "awaiting_approval"].includes(before.order!.status) &&
      !humanAccept
    )
      return before;
    const status = await rpc("fx_step", {
      _user: userId,
      _company: companyId,
      _order: orderId,
      _human_accept: humanAccept,
    });
    humanAccept = false;
    if (status === "deadline_expired" || status === before.order!.status) break;
  }
  return getFx(userId, companyId, orderId);
}
export async function hireFx(
  userId: string,
  companyId: string,
  raw: unknown,
  manualSupplier?: string,
): Promise<FxSnapshot> {
  const input = fxHireSchema.parse(raw);
  const orderId = (await rpc("fx_hire", {
    _user: userId,
    _company: companyId,
    _quote: input.quoteId,
    _authorized: input.authorizeSimulation,
    _test_failure: input.testFailure,
    _mode: manualSupplier ? "manual" : "autonomous",
    _supplier: manualSupplier ?? null,
  })) as string;
  return advanceFx(userId, companyId, orderId);
}
export async function startFx(
  userId: string,
  companyId: string,
  raw: unknown,
): Promise<FxSnapshot> {
  const input = fxStartSchema.parse(raw);
  // A retry of the original request resumes its existing order, even after quote expiry.
  await ownedCompany(userId, companyId);
  const quote = await quoteFx(userId, companyId, input);
  return hireFx(userId, companyId, {
    quoteId: quote.id,
    authorizeSimulation: true,
    testFailure: input.testFailure,
  });
}
export async function cancelFx(userId: string, companyId: string, orderId: string) {
  z.string().uuid().parse(orderId);
  await rpc("fx_cancel", { _user: userId, _company: companyId, _order: orderId });
  return getFx(userId, companyId, orderId);
}
