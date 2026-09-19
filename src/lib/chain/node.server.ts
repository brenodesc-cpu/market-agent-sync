import { z } from "zod";
import { blockHash, GENESIS_PREV_HASH } from "./block.ts";
import { validateAddress } from "./keys.ts";
import { merkleRoot } from "./merkle.ts";
import { assertTransactionPayload, verifyTransaction } from "./tx.ts";
import { deriveBalances, validateChain } from "./validate.ts";
import { chainDb, checkChainError, treasuryAddress } from "./wallet.server.ts";
import {
  CHAIN_ID,
  type ChainBlock,
  type ChainTransaction,
  type ChainValidation,
  type TransactionPayload,
} from "./types.ts";

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const heightSchema = z.number().int().min(0).max(2147483647);
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/, "Hash NMK inválido.");
const addressSchema = z.string().refine(validateAddress, "Endereço NMK inválido.");
const transactionRowSchema = z.object({
  id: z.string().uuid().optional(),
  created_at: z.string().optional(),
  txid: hashSchema,
  chain_id: z.literal(CHAIN_ID),
  type: z.enum(["MINT", "TRANSFER", "FEE", "RESERVE", "RELEASE", "ANCHOR"]),
  from_address: addressSchema.nullable(),
  to_address: addressSchema.nullable(),
  amount_units: integer,
  nonce: heightSchema,
  ref_kind: z.enum(["genesis", "order", "delivery", "report", "treasury"]).nullable(),
  ref_id: z.string().nullable(),
  payload_hash: hashSchema.nullable(),
  memo: z.string(),
  issued_at: z.string(),
  signature: z.string().regex(/^(?:[0-9a-f]{2})+$/),
  public_key: z.string().regex(/^(?:[0-9a-f]{2})+$/),
  canonical: z.string(),
  idempotency_key: z.string().trim().min(1).max(300),
  block_height: heightSchema.nullable(),
  block_index: heightSchema.nullable(),
  status: z.enum(["pending", "sealed"]),
});
const blockSchema = z.object({
  created_at: z.string().optional(),
  height: heightSchema,
  chain_id: z.literal(CHAIN_ID),
  prev_hash: hashSchema,
  merkle_root: hashSchema,
  block_hash: hashSchema,
  tx_count: heightSchema,
  validator: addressSchema,
  sealed_at: z.string(),
});

function readBlock(raw: unknown): ChainBlock {
  const block = blockSchema.parse(raw);
  return { ...block, sealed_at: new Date(block.sealed_at).toISOString() };
}
function readTransaction(raw: unknown): ChainTransaction {
  const row = transactionRowSchema.parse(raw);
  const payload = JSON.parse(row.canonical) as TransactionPayload;
  assertTransactionPayload(payload);
  const tx: ChainTransaction = {
    ...row,
    amount: row.amount_units,
    from: row.from_address,
    to: row.to_address,
    issued_at: new Date(row.issued_at).toISOString(),
  };
  // Preserve storage fields so verification catches aliases that disagree with the canonical JSON.
  if (
    row.status === "sealed"
      ? row.block_height === null || row.block_index === null
      : row.block_height !== null || row.block_index !== null
  )
    throw new Error("Posição armazenada da transação NMK inválida.");
  return tx;
}

type Snapshot = {
  blocks: ChainBlock[];
  transactions: ChainTransaction[];
  wallets: { company_id: string | null; address: string; kind: string }[];
  accounts: { company_id: string; available_units: number; reserved_units: number }[];
};
async function snapshot(): Promise<Snapshot> {
  const db = await chainDb();
  const result = await db.rpc("chain_snapshot");
  checkChainError(result.error);
  const raw = z
    .object({
      blocks: z.array(z.unknown()),
      transactions: z.array(z.unknown()),
      wallets: z.array(
        z.object({
          company_id: z.string().uuid().nullable(),
          address: addressSchema,
          kind: z.enum(["company", "treasury", "custody"]),
        }),
      ),
      accounts: z.array(
        z.object({
          company_id: z.string().uuid(),
          available_units: integer,
          reserved_units: integer,
        }),
      ),
    })
    .parse(result.data);
  return {
    ...raw,
    blocks: raw.blocks.map(readBlock),
    transactions: raw.transactions.map(readTransaction),
  };
}
function candidateBlock(
  blocks: readonly ChainBlock[],
  transactions: readonly ChainTransaction[],
  validator: string,
): ChainBlock {
  const head = blocks.at(-1);
  const header = {
    chain_id: CHAIN_ID,
    height: (head?.height ?? -1) + 1,
    prev_hash: head?.block_hash ?? GENESIS_PREV_HASH,
    merkle_root: merkleRoot(transactions.map((tx) => tx.txid)),
    tx_count: transactions.length,
    sealed_at: new Date().toISOString(),
    validator,
  };
  return { ...header, block_hash: blockHash(header) };
}
function auditSnapshot(state: Snapshot, includePending: boolean): ChainValidation {
  const groups: Record<number, ChainTransaction[]> = {};
  for (const tx of state.transactions) {
    if (tx.status === "sealed" && tx.block_height !== null)
      (groups[tx.block_height] ??= []).push(tx);
  }
  for (const txs of Object.values(groups)) txs.sort((a, b) => a.block_index! - b.block_index!);
  const blocks = [...state.blocks];
  const pending = state.transactions.filter((tx) => tx.status === "pending");
  if (includePending && pending.length && blocks.length) {
    const candidate = candidateBlock(blocks, pending, blocks[0]!.validator);
    blocks.push(candidate);
    groups[candidate.height] = pending;
  }
  const validation = validateChain(blocks, groups);
  validation.height = state.blocks.at(-1)?.height ?? -1;
  const treasury = state.wallets.find((wallet) => wallet.kind === "treasury");
  if (state.blocks.length && treasury?.address !== state.blocks[0]!.validator) {
    validation.valid = false;
    validation.issues.push({
      height: 0,
      txid: null,
      code: "VALIDATOR",
      detail: "A gênese não corresponde à tesouraria configurada.",
    });
  }
  return validation;
}

export async function getChainHead(): Promise<{
  height: number;
  blockHash: string;
  sealedAt: string;
} | null> {
  const blocks = await listBlocks(1, 0);
  const block = blocks[0];
  return block
    ? { height: block.height, blockHash: block.block_hash, sealedAt: block.sealed_at }
    : null;
}
export async function listBlocks(limit = 20, offset = 0): Promise<ChainBlock[]> {
  const paging = z
    .object({ limit: z.number().int().min(1).max(1000), offset: integer })
    .parse({ limit, offset });
  const db = await chainDb();
  const result = await db
    .from("chain_blocks")
    .select("*")
    .order("height", { ascending: false })
    .range(paging.offset, paging.offset + paging.limit - 1);
  checkChainError(result.error);
  return (result.data ?? []).map(readBlock);
}
export async function getBlock(height: number): Promise<ChainBlock | null> {
  heightSchema.parse(height);
  const db = await chainDb();
  const result = await db.from("chain_blocks").select("*").eq("height", height).maybeSingle();
  checkChainError(result.error);
  return result.data ? readBlock(result.data) : null;
}
export async function listTransactions(
  filter: { limit?: number; height?: number; status?: "pending" | "sealed" } = {},
): Promise<ChainTransaction[]> {
  const input = z
    .object({
      limit: z.number().int().min(1).max(1000).optional(),
      height: heightSchema.optional(),
      status: z.enum(["pending", "sealed"]).optional(),
    })
    .strict()
    .parse(filter);
  const db = await chainDb();
  const all: ChainTransaction[] = [];
  const limit = input.limit ?? (input.height === undefined ? 50 : Infinity);
  // Full block membership is needed for a valid Merkle proof, even beyond the API page size.
  while (all.length < limit) {
    const size = Math.min(500, limit - all.length);
    let query = db.from("chain_transactions").select("*");
    if (input.height !== undefined)
      query = query.eq("block_height", input.height).order("block_index");
    else query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    const result = await query.range(all.length, all.length + size - 1);
    checkChainError(result.error);
    const page = result.data ?? [];
    all.push(...page.map(readTransaction));
    if (page.length < size) break;
  }
  return all;
}
export async function getTransaction(txid: string): Promise<ChainTransaction | null> {
  hashSchema.parse(txid);
  const db = await chainDb();
  const result = await db.from("chain_transactions").select("*").eq("txid", txid).maybeSingle();
  checkChainError(result.error);
  return result.data ? readTransaction(result.data) : null;
}
export async function ensureGenesis(): Promise<ChainBlock> {
  const existing = await getBlock(0);
  if (existing) return existing;
  const genesis = candidateBlock([], [], await treasuryAddress());
  const db = await chainDb();
  const result = await db.rpc("chain_seal_block", { _block: genesis, _txids: [] });
  if (result.error) {
    // A concurrent initializer may have won the database lock.
    const concurrent = await getBlock(0);
    if (concurrent && concurrent.validator === genesis.validator) return concurrent;
    checkChainError(result.error);
  }
  return genesis;
}
export async function sealPendingBlock(): Promise<{ sealed: boolean; height: number | null }> {
  await ensureGenesis();
  const state = await snapshot();
  const validation = auditSnapshot(state, true);
  if (!validation.valid)
    throw new Error(
      `A cadeia NMK não pode ser selada: ${validation.issues[0]?.detail ?? "verificação inválida"}`,
    );
  const pending = state.transactions.filter((tx) => tx.status === "pending");
  if (!pending.length) return { sealed: false, height: state.blocks.at(-1)?.height ?? null };
  const block = candidateBlock(state.blocks, pending, state.blocks[0]!.validator);
  const db = await chainDb();
  const result = await db.rpc("chain_seal_block", {
    _block: block,
    _txids: pending.map((tx) => tx.txid),
  });
  checkChainError(result.error);
  return { sealed: true, height: block.height };
}
export async function submitSignedTransactions(
  transactions: readonly ChainTransaction[],
): Promise<string[]> {
  if (!Array.isArray(transactions) || transactions.length > 1000)
    throw new Error("Lista de transações NMK inválida.");
  // Validate every address and envelope before the first database access.
  const parsed = transactions.map((tx) => {
    const row = readTransaction(tx);
    if (row.status !== "pending" || !verifyTransaction(tx) || !verifyTransaction(row))
      throw new Error("Transação NMK inválida ou assinatura incompatível.");
    return row;
  });
  if (!parsed.length) return [];
  await ensureGenesis();
  const state = await snapshot();
  const byKey = new Map(state.transactions.map((tx) => [tx.idempotency_key, tx]));
  const incoming: ChainTransaction[] = [];
  for (const tx of parsed) {
    const existing = byKey.get(tx.idempotency_key);
    if (existing) {
      if (existing.txid !== tx.txid || existing.public_key !== tx.public_key)
        throw new Error("Conflito de idempotência NMK.");
    } else {
      incoming.push(tx);
      byKey.set(tx.idempotency_key, tx);
    }
  }
  const validation = auditSnapshot(
    { ...state, transactions: [...state.transactions, ...incoming] },
    true,
  );
  if (!validation.valid) {
    if (validation.issues.some((issue) => issue.code === "NONCE"))
      throw new Error(
        "NMK_NONCE_CONFLICT: O nonce NMK mudou. Atualize a carteira e assine novamente.",
      );
    throw new Error(
      `Transação NMK recusada: ${validation.issues[0]?.detail ?? "verificação inválida"}`,
    );
  }
  const db = await chainDb();
  const result = await db.rpc("chain_append_transactions", { _chain_txs: parsed });
  checkChainError(result.error);
  return z.array(hashSchema).parse(result.data);
}
export async function verifyStoredChain(): Promise<ChainValidation> {
  try {
    return auditSnapshot(await snapshot(), true);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof RangeError)
      return {
        valid: false,
        height: -1,
        issues: [
          {
            height: -1,
            txid: null,
            code: "STORAGE_FORMAT",
            detail: "A cadeia contém registros armazenados inválidos.",
          },
        ],
      };
    throw error;
  }
}

type ReconciliationRow = {
    companyId: string;
    ledgerUnits: number;
    chainUnits: number;
    reservedLedgerUnits: number;
    reservedChainUnits: number;
    valid: boolean;
    error: string | null;
  };

export async function reconcileWithLedger(): Promise<ReconciliationRow[]> {
  return reconcileSnapshot(await snapshot());
}

// Shared with database-free tests: financial reconciliation must account for pending entries too.
export function reconcileSnapshot(state: Snapshot): ReconciliationRow[] {
  const validation = auditSnapshot(state, true);
  const ordered = [
    ...state.transactions
      .filter((tx) => tx.status === "sealed")
      .sort((a, b) => a.block_height! - b.block_height! || a.block_index! - b.block_index!),
    ...state.transactions.filter((tx) => tx.status === "pending"),
  ];
  const balances = deriveBalances(ordered);
  const reserves = new Map<string, { buyer: string; amount: number }>();
  let reserveError = false;
  for (const tx of ordered) {
    if (tx.type === "RESERVE") {
      if (!tx.ref_id || tx.ref_kind !== "order" || reserves.has(tx.ref_id)) {
        reserveError = true;
        continue;
      }
      reserves.set(tx.ref_id, { buyer: tx.from!, amount: tx.amount });
    } else if (
      tx.ref_kind === "order" &&
      tx.ref_id &&
      ["RELEASE", "TRANSFER", "FEE"].includes(tx.type)
    ) {
      const reserve = reserves.get(tx.ref_id);
      if (
        !reserve ||
        reserve.amount < tx.amount ||
        (tx.type === "RELEASE" && tx.to !== reserve.buyer)
      ) {
        reserveError = true;
        continue;
      }
      reserve.amount -= tx.amount;
    }
  }
  const reserved = new Map<string, number>();
  for (const reserve of reserves.values()) {
    const next = (reserved.get(reserve.buyer) ?? 0) + reserve.amount;
    if (!Number.isSafeInteger(next)) throw new Error("A reserva NMK excede o limite seguro.");
    reserved.set(reserve.buyer, next);
  }
  const custody = state.wallets.find((wallet) => wallet.kind === "custody");
  const reservedTotal = [...reserved.values()].reduce((sum, value) => sum + BigInt(value), 0n);
  if (reservedTotal !== BigInt(custody ? (balances[custody.address] ?? 0) : 0)) reserveError = true;
  return state.wallets
    .filter((wallet) => wallet.company_id !== null)
    .map((wallet) => {
      const account = state.accounts.find((item) => item.company_id === wallet.company_id);
      const ledgerUnits = account?.available_units ?? 0;
      const chainUnits = balances[wallet.address] ?? 0;
      const reservedLedgerUnits = account?.reserved_units ?? 0;
      const reservedChainUnits = reserved.get(wallet.address) ?? 0;
      const valid =
        Boolean(account) &&
        validation.valid &&
        !reserveError &&
        ledgerUnits === chainUnits &&
        reservedLedgerUnits === reservedChainUnits;
      return {
        companyId: wallet.company_id!,
        ledgerUnits,
        chainUnits,
        reservedLedgerUnits,
        reservedChainUnits,
        valid,
        error: valid
          ? null
          : "Divergência entre a cadeia NMK e o ledger financeiro. Confira saldos, reservas e a validação da cadeia.",
      };
    });
}
