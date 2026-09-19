import { z } from "zod";
import { chainDb, checkChainError } from "./wallet.server.ts";
import type { AnchorState } from "./types.ts";

function unavailable(blockHeight: number | null): AnchorState {
  const configured = Boolean(
    process.env["NMK_ANCHOR_RPC_URL"] && process.env["NMK_ANCHOR_ACCOUNT"],
  );
  return {
    block_height: blockHeight,
    network: "external",
    external_tx_hash: null,
    status: "unavailable",
    safe_message: configured
      ? "Âncora pública indisponível: falta implementar e validar o driver da rede. A cadeia usa autoridade única e ainda não tem publicação confirmada em rede pública."
      : "Âncora pública indisponível: configure NMK_ANCHOR_RPC_URL e NMK_ANCHOR_ACCOUNT no servidor.",
    checked_at: new Date().toISOString(),
  };
}
export async function anchorStatus(): Promise<AnchorState> {
  // Configuration alone never implies submission or confirmation. No driver exists yet.
  return unavailable(null);
}
export async function requestAnchor(blockHeight: number): Promise<AnchorState> {
  z.number().int().min(0).max(2147483647).parse(blockHeight);
  const state = unavailable(blockHeight);
  const db = await chainDb();
  const result = await db.from("chain_anchors").insert(state);
  checkChainError(result.error);
  return state;
}
