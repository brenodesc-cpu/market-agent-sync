import { z } from "zod";

// User-adjustable planning assumptions in simulated credits, never provider billing.
export const economicsSchema = z.object({
  uses: z.number().int().min(1).max(10000),
  setupCredits: z.number().min(0).max(100000),
  ownRunCredits: z.number().min(0).max(10000),
  setupMinutes: z.number().min(0).max(100000),
  ownRunMinutes: z.number().min(0).max(10000),
  hasOwnAgent: z.boolean(),
});
export type EconomicsInput = z.infer<typeof economicsSchema>;
export function compareEconomics(
  input: EconomicsInput,
  offers: { id: string; price: number; deadlineHours: number }[],
) {
  const p = economicsSchema.parse(input);
  const best = [...offers].sort(
    (a, b) => a.price - b.price || a.deadlineHours - b.deadlineHours,
  )[0];
  const own = p.ownRunCredits * p.uses + (p.hasOwnAgent ? 0 : p.setupCredits);
  const hire = best ? best.price * p.uses : null;
  return {
    ownTotal: own,
    hireTotal: hire,
    ownMinutes: p.ownRunMinutes * p.uses + (p.hasOwnAgent ? 0 : p.setupMinutes),
    supplierDeadlineMinutes: best ? best.deadlineHours * 60 : null,
    offerVersionId: best?.id ?? null,
    recommended:
      hire !== null && hire < own
        ? ("hire" as const)
        : p.hasOwnAgent
          ? ("execute" as const)
          : ("create" as const),
    breakEvenUses:
      best && best.price > p.ownRunCredits
        ? Math.ceil(p.setupCredits / (best.price - p.ownRunCredits))
        : null,
    basis:
      "Comparação por custo total nas premissas informadas. O prazo do fornecedor é contratual; o tempo próprio é uma estimativa. Créditos simulados não equivalem a dólares ou tokens.",
  };
}
