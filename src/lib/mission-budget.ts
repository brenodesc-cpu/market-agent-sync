export const MAX_MISSION_STEPS = 5;

export function missionStatusAfterDelivery(
  deliveredSteps: number,
  totalSteps: number,
  awaitingReview: boolean,
) {
  if (deliveredSteps < totalSteps) return "running" as const;
  return awaitingReview ? ("awaiting_review" as const) : ("completed" as const);
}

type MissionStepEffect = {
  status: string;
  orderId?: unknown;
  result?: unknown;
};

export function requireUntouchedMissionDescendants(descendants: MissionStepEffect[]) {
  const started = descendants.some(
    (step) => step.status !== "pending" || Boolean(step.orderId) || Boolean(step.result),
  );
  if (started)
    throw new Error(
      "Uma etapa anterior foi rejeitada depois que outras etapas começaram. Inicie uma nova missão para reconstruir a cadeia com o conteúdo corrigido.",
    );
}

export function allocateMissionStepBudgets(paidSteps: boolean[], totalBudget: number) {
  if (!Number.isInteger(totalBudget) || totalBudget < 1)
    throw new Error("O orçamento da missão é inválido.");
  const paidCount = paidSteps.filter(Boolean).length;
  if (!paidCount) return paidSteps.map(() => 0);
  if (paidCount > totalBudget) throw new Error("O orçamento não cobre um crédito por etapa paga.");
  const base = Math.floor(totalBudget / paidCount);
  let remainder = totalBudget % paidCount;
  return paidSteps.map((paid) => {
    if (!paid) return 0;
    const allocation = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return allocation;
  });
}
