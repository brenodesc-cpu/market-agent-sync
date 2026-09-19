export const CHAIN_ID = "nmk-devnet-1";

export type TransactionType = "MINT" | "TRANSFER" | "FEE" | "RESERVE" | "RELEASE" | "ANCHOR";
export type TransactionPayload = {
  amount: number;
  chain_id: string;
  from: string | null;
  issued_at: string;
  memo: string;
  nonce: number;
  payload_hash: string | null;
  ref_id: string | null;
  ref_kind: "genesis" | "order" | "delivery" | "report" | "treasury" | null;
  to: string | null;
  type: TransactionType;
};

// This public envelope never contains custodial key material.
export type ChainTransaction = TransactionPayload & {
  id?: string;
  created_at?: string;
  txid: string;
  signature: string;
  public_key: string;
  canonical: string;
  from_address: string | null;
  to_address: string | null;
  amount_units: number;
  idempotency_key?: string;
  block_height: number | null;
  block_index: number | null;
  status: "pending" | "sealed";
};
export type BlockHeader = {
  chain_id: string;
  height: number;
  merkle_root: string;
  prev_hash: string;
  sealed_at: string;
  tx_count: number;
  validator: string;
};
export type ChainBlock = BlockHeader & { block_hash: string; created_at?: string };
export type ChainWalletPublic = {
  id: string;
  company_id: string | null;
  kind: "company" | "treasury" | "custody";
  address: string;
  public_key: string;
  key_version: number;
  created_at: string;
};
export type ChainIssue = { height: number; txid: string | null; code: string; detail: string };
export type ChainValidation = { valid: boolean; height: number; issues: ChainIssue[] };
export type MerkleProofStep = { position: "left" | "right"; hash: string };
export type AnchorState = {
  block_height: number | null;
  network: string;
  external_tx_hash: string | null;
  status: "unavailable" | "pending" | "submitted" | "confirmed" | "failed";
  safe_message: string;
  checked_at: string;
};
