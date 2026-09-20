import { z } from "zod";

export const browserGoalSchema = z.object({
  requestId: z.string().uuid(),
  objective: z.string().trim().min(10).max(1200),
  budget: z.number().int().min(1).max(1000),
  testFailure: z.boolean().default(false),
});
export const autonomousBrowserSchema = browserGoalSchema.extend({
  authorizeAutomaticPayment: z.literal(true),
});
export const browserScopeSchema = z.object({
  supported: z.boolean(),
  viewports: z
    .array(z.enum(["desktop", "mobile"]))
    .min(1)
    .max(2),
  form: z.boolean(),
  reason: z.string().min(5).max(500),
});
export type BrowserScope = z.infer<typeof browserScopeSchema>;
export type BrowserSupplier = {
  id: string;
  name: string;
  listPrice: number;
  minimumPrice: number;
  desktop: boolean;
  mobile: boolean;
  form: boolean;
  estimatedMs: number;
};
export function evaluateBrowserSuppliers(
  suppliers: BrowserSupplier[],
  scope: BrowserScope,
  budget: number,
) {
  const offers = suppliers.map((supplier) => {
    const proposal = Math.max(1, Math.floor(supplier.listPrice * 0.8));
    const price = Math.max(supplier.minimumPrice, proposal);
    const covered = scope.viewports.every((v) => supplier[v]) && (!scope.form || supplier.form);
    const eligible = scope.supported && covered && price <= budget;
    return {
      ...supplier,
      proposal,
      price,
      eligible,
      coverage: `${supplier.desktop ? "Desktop" : ""}${supplier.mobile ? " + mobile" : ""}${supplier.form ? " + formulário" : ""}`,
      reason: !covered
        ? "Não cobre todos os critérios do pedido."
        : price > budget
          ? "Contraproposta acima do orçamento."
          : "Cobre o pedido dentro do orçamento.",
      negotiation: `Preço anunciado: ${supplier.listPrice}. Comprador propôs ${proposal}; fornecedor aceita ${price}, conforme seu mínimo de ${supplier.minimumPrice}.`,
    };
  });
  const selected = offers
    .filter((o) => o.eligible)
    .sort(
      (a, b) => a.price - b.price || a.estimatedMs - b.estimatedMs || a.id.localeCompare(b.id),
    )[0];
  return {
    offers,
    selectedOffer: selected?.id ?? null,
    reason: selected
      ? `${selected.name} cobre o escopo por ${selected.price} créditos, o menor preço elegível após a negociação.`
      : "Nenhuma oferta cobre o objetivo dentro do orçamento. Nenhum crédito reservado.",
  };
}
