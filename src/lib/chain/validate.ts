import { blockHash, GENESIS_PREV_HASH } from "./block.ts";
import { deriveAddress, validateAddress } from "./keys.ts";
import { merkleRoot } from "./merkle.ts";
import { assertTransactionPayload, txid, verifyTransaction } from "./tx.ts";
import { CHAIN_ID, type ChainBlock, type ChainTransaction, type ChainValidation } from "./types.ts";

function applyBalance(balances: Map<string, number>, tx: ChainTransaction): void {
  if (tx.type === "ANCHOR") return;
  if (tx.from !== null) {
    const next = (balances.get(tx.from) ?? 0) - tx.amount;
    if (!Number.isSafeInteger(next) || next < 0) throw new Error("Saldo NMK insuficiente.");
    balances.set(tx.from, next);
  }
  if (tx.to !== null) {
    const next = (balances.get(tx.to) ?? 0) + tx.amount;
    if (!Number.isSafeInteger(next))
      throw new Error("Saldo NMK excede o limite de inteiro seguro.");
    balances.set(tx.to, next);
  }
}

export function deriveBalances(transactions: readonly ChainTransaction[]): Record<string, number> {
  const balances = new Map<string, number>();
  for (const tx of transactions) {
    assertTransactionPayload(tx);
    applyBalance(balances, tx);
  }
  return Object.fromEntries(balances);
}

function validateChainRecords(
  blocks: readonly ChainBlock[],
  txsByHeight:
    | Readonly<Record<number, readonly ChainTransaction[]>>
    | ReadonlyMap<number, readonly ChainTransaction[]>,
): ChainValidation {
  const result: ChainValidation = { valid: true, height: blocks.at(-1)?.height ?? -1, issues: [] };
  const seen = new Set<string>();
  const nonces = new Map<string, number>();
  const balances = new Map<string, number>();
  const treasury = blocks[0]?.validator;
  if (!blocks.length)
    result.issues.push({
      height: -1,
      txid: null,
      code: "EMPTY_CHAIN",
      detail: "A cadeia ainda não possui gênese.",
    });
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    const issue = (code: string, detail: string, tx: ChainTransaction | null = null) => {
      result.issues.push({ height: block.height, txid: tx?.txid ?? null, code, detail });
    };
    const txs: readonly ChainTransaction[] =
      txsByHeight instanceof Map
        ? (txsByHeight.get(block.height) ?? [])
        : ((txsByHeight as Readonly<Record<number, readonly ChainTransaction[]>>)[block.height] ??
          []);
    if (block.height !== index) issue("HEIGHT", "As alturas não são sequenciais desde a gênese.");
    if (block.prev_hash !== (blocks[index - 1]?.block_hash ?? GENESIS_PREV_HASH))
      issue("PREV_HASH", "O vínculo com o bloco anterior foi alterado.");
    if (block.chain_id !== CHAIN_ID) issue("CHAIN_ID", "O bloco pertence a outra cadeia.");
    if (!validateAddress(block.validator) || block.validator !== treasury)
      issue("VALIDATOR", "O validador difere da autoridade única da gênese.");
    if (!Number.isSafeInteger(block.tx_count) || block.tx_count !== txs.length)
      issue("TX_COUNT", "A quantidade de transações não corresponde ao bloco.");
    try {
      if (new Date(block.sealed_at).toISOString() !== block.sealed_at) throw new Error();
    } catch {
      issue("BLOCK_FORMAT", "Data de selagem inválida.");
    }
    try {
      if (blockHash(block) !== block.block_hash)
        issue("BLOCK_HASH", "O hash do bloco foi alterado.");
    } catch {
      issue("BLOCK_HASH", "O cabeçalho do bloco é inválido.");
    }
    try {
      if (merkleRoot(txs.map((tx) => tx.txid)) !== block.merkle_root)
        issue("MERKLE_ROOT", "A raiz Merkle não corresponde às transações.");
    } catch {
      issue("MERKLE_ROOT", "As folhas Merkle são inválidas.");
    }
    for (let txIndex = 0; txIndex < txs.length; txIndex++) {
      const tx = txs[txIndex]!;
      if (tx.chain_id !== block.chain_id)
        issue("CHAIN_ID", "A transação pertence a outra cadeia.", tx);
      if (
        (tx.block_height != null && tx.block_height !== block.height) ||
        (tx.block_index != null && tx.block_index !== txIndex)
      )
        issue("TX_ORDER", "A posição da transação no bloco é inválida.", tx);
      if (seen.has(tx.txid)) issue("DUPLICATE_TXID", "A transação está repetida na cadeia.", tx);
      seen.add(tx.txid);
      try {
        if (txid(tx) !== tx.txid) issue("TXID", "O conteúdo da transação foi alterado.", tx);
      } catch {
        issue("TXID", "O conteúdo da transação é inválido.", tx);
      }
      if (!verifyTransaction(tx, treasury))
        issue("SIGNATURE", "A assinatura ou sua autoridade é inválida.", tx);
      try {
        assertTransactionPayload(tx);
      } catch {
        issue("TX_FORMAT", "Os campos da transação são inválidos.", tx);
        continue;
      }
      try {
        const signer = deriveAddress(tx.public_key);
        const expected = nonces.get(signer) ?? 0;
        if (tx.nonce !== expected)
          issue("NONCE", "O nonce deve começar em zero e avançar sem repetição ou lacuna.", tx);
        nonces.set(signer, tx.nonce + 1);
      } catch {
        issue("SIGNATURE", "A chave pública da assinatura é inválida.", tx);
      }
      try {
        applyBalance(balances, tx);
      } catch {
        issue("BALANCE", "Saldo negativo ou fora do limite seguro.", tx);
      }
    }
  }
  const heights =
    txsByHeight instanceof Map ? [...txsByHeight.keys()] : Object.keys(txsByHeight).map(Number);
  if (heights.some((height) => !blocks.some((block) => block.height === height)))
    result.issues.push({
      height: -1,
      txid: null,
      code: "ORPHAN_TRANSACTIONS",
      detail: "Há transações sem bloco correspondente.",
    });
  result.valid = result.issues.length === 0;
  return result;
}

export function validateChain(
  blocks: readonly ChainBlock[],
  txsByHeight:
    | Readonly<Record<number, readonly ChainTransaction[]>>
    | ReadonlyMap<number, readonly ChainTransaction[]>,
): ChainValidation {
  try {
    return validateChainRecords(blocks, txsByHeight);
  } catch {
    return {
      valid: false,
      height: -1,
      issues: [{ height: -1, txid: null, code: "MALFORMED_CHAIN", detail: "A cadeia contém registros malformados." }],
    };
  }
}
