import { createHash } from "node:crypto";
import type { MerkleProofStep } from "./types.ts";

const ZERO = "0".repeat(64);
function bytes(hash: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("Hash NMK inválido.");
  return Buffer.from(hash, "hex");
}
function parent(left: Buffer, right: Buffer): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([left, right]))
    .digest();
}
function nextLevel(nodes: Buffer[]): Buffer[] {
  const next: Buffer[] = [];
  for (let i = 0; i < nodes.length; i += 2) next.push(parent(nodes[i]!, nodes[i + 1] ?? nodes[i]!));
  return next;
}
export function merkleRoot(txids: readonly string[]): string {
  let nodes = txids.map(bytes);
  while (nodes.length > 1) nodes = nextLevel(nodes);
  return nodes[0]?.toString("hex") ?? ZERO;
}
export function merkleProof(txids: readonly string[], index: number): MerkleProofStep[] {
  if (!Number.isInteger(index) || index < 0 || index >= txids.length)
    throw new Error("Índice de inclusão NMK inválido.");
  let nodes = txids.map(bytes);
  const proof: MerkleProofStep[] = [];
  while (nodes.length > 1) {
    const right = index % 2 === 0;
    proof.push({
      position: right ? "right" : "left",
      hash: (nodes[right ? index + 1 : index - 1] ?? nodes[index]!).toString("hex"),
    });
    nodes = nextLevel(nodes);
    index = Math.floor(index / 2);
  }
  return proof;
}
export function verifyMerkleProof(
  txid: string,
  proof: readonly MerkleProofStep[],
  root: string,
): boolean {
  try {
    bytes(root);
    let current = bytes(txid);
    for (const step of proof) {
      if (step.position !== "left" && step.position !== "right") return false;
      const sibling = bytes(step.hash);
      current = step.position === "left" ? parent(sibling, current) : parent(current, sibling);
    }
    return current.toString("hex") === root;
  } catch {
    return false;
  }
}
