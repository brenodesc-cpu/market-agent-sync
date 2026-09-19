import { createHash, type KeyObject } from "node:crypto";
import { deriveAddress, signPayload, validateAddress, verifyPayload } from "./keys.ts";
import { CHAIN_ID, type ChainTransaction, type TransactionPayload } from "./types.ts";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0))
    return String(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonicalize).join(",")}]`;
  if (typeof value === "object" && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error("Conteúdo inválido para a forma canônica NMK.");
}

export function transactionPayload(tx: TransactionPayload): TransactionPayload {
  return {
    amount: tx.amount,
    chain_id: tx.chain_id,
    from: tx.from,
    issued_at: tx.issued_at,
    memo: tx.memo,
    nonce: tx.nonce,
    payload_hash: tx.payload_hash,
    ref_id: tx.ref_id,
    ref_kind: tx.ref_kind,
    to: tx.to,
    type: tx.type,
  };
}

export function assertTransactionPayload(tx: TransactionPayload): void {
  if (
    !Number.isSafeInteger(tx.amount) ||
    tx.amount < 0 ||
    Object.is(tx.amount, -0) ||
    !Number.isSafeInteger(tx.nonce) ||
    tx.nonce < 0 ||
    tx.nonce > 2147483647 ||
    Object.is(tx.nonce, -0) ||
    tx.chain_id !== CHAIN_ID ||
    typeof tx.memo !== "string" ||
    [...tx.memo].length > 200 ||
    typeof tx.issued_at !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(tx.issued_at) ||
    !Number.isFinite(Date.parse(tx.issued_at)) ||
    new Date(tx.issued_at).toISOString() !== tx.issued_at ||
    (tx.from !== null && !validateAddress(tx.from)) ||
    (tx.to !== null && !validateAddress(tx.to)) ||
    (tx.payload_hash !== null &&
      (typeof tx.payload_hash !== "string" || !/^[0-9a-f]{64}$/.test(tx.payload_hash))) ||
    (tx.ref_id !== null && typeof tx.ref_id !== "string") ||
    ![null, "genesis", "order", "delivery", "report", "treasury"].includes(tx.ref_kind)
  )
    throw new Error("Transação NMK inválida.");
  switch (tx.type) {
    case "MINT":
      if (tx.from !== null || tx.to === null || tx.amount <= 0)
        throw new Error("Emissão NMK inválida.");
      break;
    case "TRANSFER":
    case "FEE":
    case "RESERVE":
    case "RELEASE":
      if (tx.from === null || tx.to === null || tx.from === tx.to || tx.amount <= 0)
        throw new Error("Movimentação NMK inválida.");
      break;
    case "ANCHOR":
      if (tx.from === null || tx.to !== null || tx.amount !== 0 || tx.payload_hash === null)
        throw new Error("Registro de artefato NMK inválido.");
      break;
    default:
      throw new Error("Tipo de transação NMK inválido.");
  }
}

export function txid(payload: TransactionPayload | string): string {
  const canonical =
    typeof payload === "string" ? payload : canonicalize(transactionPayload(payload));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildTransaction(
  payload: TransactionPayload,
  privateKey: KeyObject,
  publicKey: string,
): ChainTransaction {
  assertTransactionPayload(payload);
  const canonical = canonicalize(transactionPayload(payload));
  const signed: ChainTransaction = {
    ...transactionPayload(payload),
    canonical,
    txid: txid(canonical),
    signature: signPayload(canonical, privateKey),
    public_key: publicKey,
    from_address: payload.from,
    to_address: payload.to,
    amount_units: payload.amount,
    block_height: null,
    block_index: null,
    status: "pending",
  };
  // Treasury authorization for MINT is checked against the trusted block validator by validateChain.
  if (!verifyTransaction(signed)) throw new Error("A assinatura não corresponde à carteira NMK.");
  return signed;
}

export function verifyTransaction(tx: ChainTransaction, treasury?: string): boolean {
  try {
    assertTransactionPayload(tx);
    const canonical = canonicalize(transactionPayload(tx));
    const signer = deriveAddress(tx.public_key);
    return (
      tx.from_address === tx.from &&
      tx.to_address === tx.to &&
      tx.amount_units === tx.amount &&
      tx.canonical === canonical &&
      tx.txid === txid(canonical) &&
      (tx.type === "MINT" ? treasury === undefined || signer === treasury : signer === tx.from) &&
      verifyPayload(canonical, tx.signature, tx.public_key)
    );
  } catch {
    return false;
  }
}
