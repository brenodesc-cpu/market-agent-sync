import type { FxSnapshot } from "./fx-market.ts";

// The supervisor may correct a document, but never supplies a human payment approval.
export async function runFxReviewFlow(port: {
  read: () => Promise<FxSnapshot>;
  step: () => Promise<string>;
}): Promise<FxSnapshot> {
  for (let i = 0; i < 7; i++) {
    const current = await port.read();
    const order = current.order;
    if (!order || order.mode !== "manual") throw new Error("fx_human_review_required");
    if (["awaiting_approval", "settled", "cancelled", "expired"].includes(order.status))
      return current;
    if (order.status === "rejected" && order.current_version >= 2) return current;
    const next = await port.step();
    if (next === "deadline_expired" || next === order.status) return port.read();
  }
  return port.read();
}
