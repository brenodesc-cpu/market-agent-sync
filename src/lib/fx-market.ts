import { z } from "zod";
export const fxGoalSchema = z.object({
  requestId: z.string().uuid(),
  targetUsdCents: z.number().int().min(100).max(1000000),
  maxTotalBrlCents: z.number().int().min(100).max(10000000),
  maxSettlementMinutes: z.number().int().min(1).max(2880).default(60),
});
export const fxStartSchema = fxGoalSchema.extend({
  authorizeSimulation: z.literal(true),
  testFailure: z.boolean().default(true),
});
export const fxHireSchema = z.object({
  quoteId: z.string().uuid(),
  authorizeSimulation: z.literal(true),
  testFailure: z.boolean().default(true),
});
export type FxOffer = {
  supplierId: string;
  name: string;
  totalBrlCents: number;
  listTotalBrlCents: number;
  principalBrlCents: number;
  platformFeeBrlCents: number;
  targetUsdCents: number;
  feeBrlCents: number;
  listFeeBrlCents: number;
  proposedFeeBrlCents: number;
  settlementMinutes: number;
  eligible: boolean;
  reason: string;
};
export type FxInference = {
  status: string;
  durationMs?: number;
  costUsd?: null;
  pricingReference?: string;
  summary: string;
  requestedModel?: string;
  resolvedModel?: string | null;
  usage?: {
    total_tokens?: number | undefined;
    prompt_tokens?: number | undefined;
    completion_tokens?: number | undefined;
  } | null;
  estimatedCostUsd?: number | null;
};
export type FxQuote = {
  id: string;
  expires_at: string;
  input: z.infer<typeof fxGoalSchema>;
  data: { offers: FxOffer[]; selected: FxOffer | null; policy: string };
  inference: FxInference | null;
};
export type FxOrder = {
  id: string;
  status: string;
  mode: string;
  current_version: number;
  deadline_at: string;
  contract: FxOffer & {
    recipientCompanyId: string;
    maxTotalBrlCents: number;
    maxSettlementMinutes: number;
  };
};
export type FxSnapshot = {
  simulation: true;
  order?: FxOrder;
  orders?: FxOrder[];
  quote?: FxQuote;
  wallet: { available_brl: number; reserved_brl: number; available_usd: number; spent_brl: number };
  operation?: { operation_id: string; status: string; target_usd: number };
  receipts?: { version: number; sha256: string; body: Record<string, unknown> }[];
  reports?: {
    version: number;
    decision: string;
    checks: { criterion: string; passed: boolean; expected?: number; observed?: number }[];
  }[];
  events?: {
    id: number;
    actor: string;
    type: string;
    created_at: string;
    detail: Record<string, unknown>;
  }[];
  ledger?: { principal_brl: number; platform_fee_brl: number; target_usd: number } | null;
  reviewUrl?: string;
};
