import { z } from "zod";
export const BROWSER_OFFER = "00000000-0000-0000-0000-000000002302";
export const browserPurchaseSchema = z.object({
  requestId: z.string().uuid(),
  budget: z.number().int().min(1).max(1000),
  testFailure: z.boolean().default(false),
  fixture: z.literal("lead-form-v1").default("lead-form-v1"),
  source: z.enum(["studio", "mcp"]).default("studio"),
});
export const browserEvidenceSchema = z.object({
  version: z.literal(1),
  orderId: z.string().uuid(),
  token: z.string().uuid(),
  samples: z
    .array(
      z.object({
        viewport: z.enum(["desktop", "mobile"]),
        width: z.number().int(),
        height: z.number().int(),
        url: z.string().url(),
        submitted: z.boolean(),
        outcome: z.enum(["success", "bug"]),
        finding: z.string().min(1).max(1000),
        screenshot: z.string().min(100).max(400000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        durationMs: z.number().int().min(1).max(60000),
      }),
    )
    .max(2),
});
export type BrowserEvidence = z.infer<typeof browserEvidenceSchema>;
export function browserQuote(budget: number) {
  return {
    currency: "simulated_credits",
    selectedOffer: budget >= 15 ? BROWSER_OFFER : null,
    price: 15,
    fee: 1,
    supplierReceives: 14,
    reason:
      budget >= 15
        ? "BrowserQA testa o formulário em desktop e mobile. A oferta de 5 créditos não cobre o pedido."
        : "O serviço completo custa 15 créditos. Nenhuma contratação foi feita.",
    offers: [
      {
        name: "PageCheck",
        price: 5,
        eligible: false,
        coverage: "Captura desktop",
        estimatedTime: "≈ 5 s",
        reason: "Não testa formulário nem mobile.",
      },
      {
        name: "BrowserQA",
        price: 15,
        eligible: budget >= 15,
        coverage: "Desktop + mobile + envio",
        estimatedTime: "< 20 s",
        reason: "Cobre os dois tamanhos e a interação.",
      },
    ],
    ownExecution:
      "Se o agente já tem um navegador e testes equivalentes, pode executar sozinho. Este caso demonstra um comprador sem essa ferramenta.",
  };
}
