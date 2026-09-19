import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AnchorState,
  ChainBlock,
  ChainTransaction,
  ChainValidation,
  ChainWalletPublic,
  MerkleProofStep,
} from "./chain/types";

// The chain layer ships as migration 0008. Until it is applied to the connected database
// every read fails with a missing relation, so each entry point degrades into a labelled
// pending state instead of an error page. The project requires an absent integration to stay
// visible as a pendency, never to be hidden or faked.
const MISSING_TABLES =
  /relation .* does not exist|schema cache|PGRST20[0-9]|could not find the (table|function)/i;
// Vite, Node and Rollup each word a missing module differently; all three mean the same thing.
const MISSING_MODULES =
  /cannot find module|failed to (resolve import|load url)|does the file exist|ERR_MODULE_NOT_FOUND/i;
const MISSING_SECRET = /NMK_WALLET_SECRET/i;

export type ChainSetupState = { applied: true } | { applied: false; message: string };

function setupState(error: unknown): ChainSetupState {
  const message = error instanceof Error ? error.message : String(error);
  if (MISSING_MODULES.test(message))
    return {
      applied: false,
      message:
        "A camada NMK ainda não foi construída neste ambiente. Os módulos da cadeia não estão disponíveis.",
    };
  if (MISSING_TABLES.test(message))
    return {
      applied: false,
      message:
        "A camada NMK ainda não foi aplicada neste banco. Rode a migration 0008_nmk_chain.sql para publicar o registro.",
    };
  if (MISSING_SECRET.test(message))
    return {
      applied: false,
      message:
        "A carteira da plataforma não pode ser aberta sem o segredo de cifra configurado no servidor.",
    };
  throw error instanceof Error ? error : new Error(message);
}

export type ChainOverview = {
  setup: ChainSetupState;
  head: { height: number; blockHash: string; sealedAt: string } | null;
  blocks: ChainBlock[];
  transactions: ChainTransaction[];
  pendingCount: number;
  anchor: AnchorState | null;
};

export const getChainOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChainOverview> => {
    const empty: ChainOverview = {
      setup: { applied: true },
      head: null,
      blocks: [],
      transactions: [],
      pendingCount: 0,
      anchor: null,
    };
    try {
      const node = await import("./chain/node.server");
      const { anchorStatus } = await import("./chain/anchor.server");
      const [head, blocks, transactions, anchor] = await Promise.all([
        node.getChainHead(),
        node.listBlocks(12, 0),
        node.listTransactions({ limit: 20 }),
        anchorStatus(),
      ]);
      return {
        setup: { applied: true },
        head,
        blocks,
        transactions,
        pendingCount: transactions.filter((tx) => tx.status === "pending").length,
        anchor,
      };
    } catch (error) {
      return { ...empty, setup: setupState(error) };
    }
  },
);

export type BlockDetails = {
  block: ChainBlock;
  transactions: ChainTransaction[];
};

export const getBlockDetails = createServerFn({ method: "GET" })
  .validator(z.object({ height: z.number().int().min(0) }))
  .handler(async ({ data }): Promise<BlockDetails | null> => {
    const node = await import("./chain/node.server");
    const block = await node.getBlock(data.height);
    if (!block) return null;
    return { block, transactions: await node.listTransactions({ height: data.height }) };
  });

export type TransactionDetails = {
  transaction: ChainTransaction;
  block: ChainBlock | null;
  proof: MerkleProofStep[] | null;
  proofValid: boolean | null;
};

// The proof is recomputed here and checked with the pure verifier, so the page shows a result
// that was produced by the same code an outside auditor can run against the stored block.
export const getTransactionDetails = createServerFn({ method: "GET" })
  .validator(z.object({ txid: z.string().regex(/^[0-9a-f]{64}$/) }))
  .handler(async ({ data }): Promise<TransactionDetails | null> => {
    const node = await import("./chain/node.server");
    const transaction = await node.getTransaction(data.txid);
    if (!transaction) return null;
    if (transaction.block_height === null)
      return { transaction, block: null, proof: null, proofValid: null };

    const { merkleProof, verifyMerkleProof } = await import("./chain/merkle");
    const [block, siblings] = await Promise.all([
      node.getBlock(transaction.block_height),
      node.listTransactions({ height: transaction.block_height }),
    ]);
    const txids = siblings.map((tx) => tx.txid);
    const index = txids.indexOf(transaction.txid);
    if (!block || index < 0) return { transaction, block, proof: null, proofValid: null };
    const proof = merkleProof(txids, index);
    return {
      transaction,
      block,
      proof,
      proofValid: verifyMerkleProof(transaction.txid, proof, block.merkle_root),
    };
  });

export type ChainAudit = {
  validation: ChainValidation;
  reconciliation: { companyId: string; ledgerUnits: number; chainUnits: number }[];
  checkedAt: string;
};

// Verification is deliberately exposed to anyone: the point of the layer is that the record
// can be audited without trusting this server. A divergence is returned, never swallowed.
export const auditChain = createServerFn({ method: "POST" }).handler(
  async (): Promise<ChainAudit> => {
    const node = await import("./chain/node.server");
    const [validation, reconciliation] = await Promise.all([
      node.verifyStoredChain(),
      node.reconcileWithLedger(),
    ]);
    return { validation, reconciliation, checkedAt: new Date().toISOString() };
  },
);

// Both wallet handlers reach the database with the service role, which bypasses RLS, so the
// caller's membership has to be proved here before the company id is used for anything.
export const getCompanyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<ChainWalletPublic | null> => {
    const { ownedCompany } = await import("./studio-runtime.server");
    await ownedCompany(context.userId, data.companyId);
    const { getCompanyWalletPublic } = await import("./chain/wallet.server");
    return getCompanyWalletPublic(data.companyId);
  });

export const createCompanyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<ChainWalletPublic> => {
    const { ownedCompany } = await import("./studio-runtime.server");
    await ownedCompany(context.userId, data.companyId);
    const { ensureCompanyWallet } = await import("./chain/wallet.server");
    return ensureCompanyWallet(data.companyId);
  });

// Sealing only orders transactions that were already committed alongside their settlement.
// It cannot create, move or destroy value, so an authenticated member may trigger it.
export const sealChainBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ sealed: boolean; height: number | null }> => {
    const { sealPendingBlock } = await import("./chain/node.server");
    return sealPendingBlock();
  });
