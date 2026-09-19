import { createHash } from "node:crypto";
import { canonicalize } from "./tx.ts";
import type { BlockHeader } from "./types.ts";

export const GENESIS_PREV_HASH = "0".repeat(64);
export function canonicalizeHeader(header: BlockHeader): string {
  return canonicalize({
    chain_id: header.chain_id,
    height: header.height,
    merkle_root: header.merkle_root,
    prev_hash: header.prev_hash,
    sealed_at: header.sealed_at,
    tx_count: header.tx_count,
    validator: header.validator,
  });
}
export function blockHash(header: BlockHeader): string {
  return createHash("sha256").update(canonicalizeHeader(header), "utf8").digest("hex");
}
