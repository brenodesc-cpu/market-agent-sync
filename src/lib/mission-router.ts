export type MissionMode = "internal" | "network" | "created";

export function resolveMissionRoute(
  proposal: { mode: "internal" | "network" | "create"; offerVersionId: string | null },
  hasInternal: boolean,
  availableOfferIds: string[],
): { mode: MissionMode; offerVersionId?: string } {
  if (proposal.mode === "internal" && hasInternal) return { mode: "internal" };
  if (
    proposal.mode === "network" &&
    proposal.offerVersionId &&
    availableOfferIds.includes(proposal.offerVersionId)
  )
    return { mode: "network", offerVersionId: proposal.offerVersionId };
  return { mode: "created" };
}
