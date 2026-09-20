import { createHash } from "node:crypto";
import { z } from "zod";
import { runtimeDb, rpc, ownedCompany } from "./studio-runtime.server.ts";
import { neuralakeJson } from "./neuralake-json.server.ts";
import {
  browserGoalSchema,
  autonomousBrowserSchema,
  browserScopeSchema,
  evaluateBrowserSuppliers,
  type BrowserSupplier,
} from "./browser-market.ts";

export async function quoteBrowserMission(userId: string, companyId: string, raw: unknown) {
  const input = browserGoalSchema.parse(raw);
  await ownedCompany(userId, companyId);
  const db = await runtimeDb();
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing = await db
    .from("browser_mission_quotes")
    .select("*")
    .eq("company_id", companyId)
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (existing.error) throw new Error("A migração da autonomia precisa estar aplicada.");
  if (existing.data) {
    if (existing.data.input_hash !== hash) throw new Error("idempotency_conflict");
    return existing.data;
  }
  const inference = await neuralakeJson(
    `Você é o agente comprador de testes de navegador. Extraia os critérios do objetivo sem criar tarefas adicionais. A única página disponível é a página de demonstração controlada lead-form-v1. Testes suportados: captura desktop, captura mobile e preenchimento do formulário nessa página. Rejeite pedidos de outro site, outra ação ou objetivo ambíguo. Retorne JSON {supported:boolean,viewports:["desktop" e/ou "mobile"],form:boolean,reason:string}. Se o objetivo pedir computador e celular, inclua ambos. Testar formulário exige form=true. Não selecione fornecedores; descreva o escopo solicitado.`,
    { objective: input.objective },
    "text",
    (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(14000) }),
    500,
  );
  const scope = browserScopeSchema.parse(inference.value);
  scope.viewports = [...new Set(scope.viewports)];
  if (!scope.supported) throw new Error(`Objetivo não suportado: ${scope.reason}`);
  const result = await db.rpc("browser_market_suppliers");
  if (result.error) throw new Error(result.error.message);
  const suppliers = z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        listPrice: z.number().int().positive(),
        minimumPrice: z.number().int().positive(),
        desktop: z.boolean(),
        mobile: z.boolean(),
        form: z.boolean(),
        estimatedMs: z.number().positive(),
      }),
    )
    .parse(result.data) as BrowserSupplier[];
  const quote = evaluateBrowserSuppliers(suppliers, scope, input.budget);
  const audit = {
    requestedModel: "text",
    resolvedModel: inference.resolvedModel,
    usage: inference.usage,
    durationMs: inference.durationMs,
    costUsd: null,
    estimatedCostUsd:
      inference.usage?.prompt_tokens != null && inference.usage?.completion_tokens != null
        ? (inference.usage.prompt_tokens * 0.15 + inference.usage.completion_tokens * 0.6) /
          1_000_000
        : null,
    pricingReference: {
      inputUsdPerMillion: 0.15,
      outputUsdPerMillion: 0.6,
      source: "docs-neuralake.txt fornecido pela equipe, consultado em 20/09/2026",
      kind: "estimate_not_billing",
    },
    costNote:
      "O custo de referência usa a tabela fornecida pela equipe ($0,15 entrada e $0,60 saída por milhão de tokens). A cobrança efetiva não foi informada. O orçamento de serviços usa créditos simulados.",
    maxOutputTokens: 500,
    selectionEngine: "coverage-price-v1",
    executionEngine: "Chromium",
    verificationEngine: "browser-contract-v2",
  };
  const inserted = await db
    .from("browser_mission_quotes")
    .insert({
      company_id: companyId,
      requested_by: userId,
      request_id: input.requestId,
      input_hash: hash,
      objective: input.objective,
      budget: input.budget,
      test_failure: input.testFailure,
      scope,
      quote,
      inference: audit,
    })
    .select("*")
    .single();
  if (inserted.error?.code === "23505") {
    const prior = await db
      .from("browser_mission_quotes")
      .select("*")
      .eq("company_id", companyId)
      .eq("request_id", input.requestId)
      .single();
    if (prior.error || prior.data.input_hash !== hash) throw new Error("idempotency_conflict");
    return prior.data;
  }
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data;
}
export async function hireBrowserQuote(userId: string, companyId: string, raw: unknown) {
  const input = z
    .object({
      quoteId: z.string().uuid(),
      mode: z.enum(["autonomous", "manual"]),
      offerVersionId: z.string().uuid().optional(),
      authorizeAutomaticPayment: z.boolean().default(false),
      source: z.enum(["studio", "mcp"]).default("mcp"),
    })
    .parse(raw);
  if (input.mode === "autonomous" && !input.authorizeAutomaticPayment)
    throw new Error("automatic_payment_authorization_required");
  await ownedCompany(userId, companyId);
  return rpc("studio_place_browser_mission", {
    _user: userId,
    _company: companyId,
    _quote: input.quoteId,
    _mode: input.mode,
    _offer: input.offerVersionId ?? null,
    _authorized: input.authorizeAutomaticPayment,
    _source: input.source,
  });
}
export async function startBrowserMission(
  userId: string,
  companyId: string,
  raw: unknown,
  source: "studio" | "mcp" = "mcp",
) {
  const input = autonomousBrowserSchema.parse(raw);
  const quote = await quoteBrowserMission(userId, companyId, input);
  if (!quote.quote.selectedOffer)
    return {
      status: "not_feasible",
      quoteId: quote.id,
      ...quote.quote,
      inference: quote.inference,
    };
  const order = await hireBrowserQuote(userId, companyId, {
    quoteId: quote.id,
    mode: "autonomous",
    authorizeAutomaticPayment: true,
    source,
  });
  return { ...order, quoteId: quote.id, selection: quote.quote, inference: quote.inference };
}
