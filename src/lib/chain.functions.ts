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
  Reputation,
} from "./chain/types";
import type { EconomySummary } from "./chain/economy";

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
const MISSING_BACKEND =
  /Missing Supabase environment variable|SUPABASE_SERVICE_ROLE_KEY|Backend indisponível/i;

// Three distinct situations, never blurred: the real record, a local development chain, and
// nothing at all. The interface has to be able to tell a viewer which one they are looking at.
export type ChainSetupState =
  { mode: "database" } | { mode: "devnet"; message: string } | { mode: "pending"; message: string };

function setupState(error: unknown): ChainSetupState {
  const message = error instanceof Error ? error.message : String(error);
  if (MISSING_MODULES.test(message))
    return {
      mode: "pending",
      message:
        "A camada NMK ainda não foi construída neste ambiente. Os módulos da cadeia não estão disponíveis.",
    };
  if (MISSING_TABLES.test(message))
    return {
      mode: "pending",
      message:
        "A camada NMK ainda não foi aplicada neste banco. Rode a migration 0008_nmk_chain.sql para publicar o registro.",
    };
  if (MISSING_BACKEND.test(message))
    return {
      mode: "pending",
      message:
        "Este ambiente está sem a conexão de servidor necessária para ler o registro. Use a versão online.",
    };
  if (MISSING_SECRET.test(message))
    return {
      mode: "pending",
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
  economy: EconomySummary;
  reputations: Reputation[];
};

// Business figures and supplier records are derived here from the same signed history the page
// already shows, so a reader can recompute both from the record instead of trusting a total.
// The cap is the honest limit of this view: a longer chain needs paging, not a bigger number.
const SUMMARY_TX_LIMIT = 1000;

async function derive(transactions: ChainTransaction[]) {
  const { summariseEconomy, deriveReputation } = await import("./chain/economy");
  return {
    economy: summariseEconomy(transactions),
    reputations: deriveReputation(transactions)
      .filter((reputation) => reputation.settledContracts > 0 || reputation.activeStakeUnits > 0)
      .sort((a, b) => b.earnedUnits - a.earnedUnits),
  };
}

export const getChainOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChainOverview> => {
    try {
      const node = await import("./chain/node.server");
      const { anchorStatus } = await import("./chain/anchor.server");
      const [head, blocks, everything, anchor] = await Promise.all([
        node.getChainHead(),
        node.listBlocks(12, 0),
        node.listTransactions({ limit: SUMMARY_TX_LIMIT }),
        anchorStatus(),
      ]);
      return {
        setup: { mode: "database" },
        head,
        blocks,
        transactions: everything.slice(0, 20),
        pendingCount: everything.filter((tx) => tx.status === "pending").length,
        anchor,
        ...(await derive(everything)),
      };
    } catch (error) {
      const setup = setupState(error);
      // A record nobody can open teaches nobody anything, so development falls back to a local
      // chain. It is built with the same cryptography and validated before it is served, and it
      // is labelled, because it is not the real record and must never read as one.
      return (await devnetOverview(setup)) ?? emptyOverview(setup);
    }
  },
);

function emptyOverview(setup: ChainSetupState): ChainOverview {
  return {
    setup,
    head: null,
    blocks: [],
    transactions: [],
    pendingCount: 0,
    anchor: null,
    economy: {
      contractedUnits: 0,
      supplierPayoutUnits: 0,
      platformFeeUnits: 0,
      lockedCollateralUnits: 0,
      burnedCollateralUnits: 0,
      issuedUnits: 0,
      redeemedUnits: 0,
    },
    reputations: [],
  };
}

async function devnetOverview(setup: ChainSetupState): Promise<ChainOverview | null> {
  try {
    const { devnet, devnetEnabled } = await import("./chain/devnet.server");
    if (!devnetEnabled()) return null;
    const local = devnet();
    const head = local.blocks[0];
    return {
      setup: {
        mode: "devnet",
        message:
          `${setup.mode === "pending" ? setup.message : ""} Você está vendo uma cadeia local de desenvolvimento: a criptografia é real e foi validada, mas as empresas e os dois pedidos são um cenário de exemplo.`.trim(),
      },
      head: head
        ? { height: head.height, blockHash: head.block_hash, sealedAt: head.sealed_at }
        : null,
      blocks: local.blocks,
      transactions: local.transactions.slice(0, 20),
      pendingCount: 0,
      anchor: null,
      ...(await derive(local.transactions)),
    };
  } catch {
    return null;
  }
}

export type BlockDetails = {
  block: ChainBlock;
  transactions: ChainTransaction[];
};

export const getBlockDetails = createServerFn({ method: "GET" })
  .validator(z.object({ height: z.number().int().min(0) }))
  .handler(async ({ data }): Promise<BlockDetails | null> => {
    try {
      const node = await import("./chain/node.server");
      const block = await node.getBlock(data.height);
      if (!block) return null;
      return { block, transactions: await node.listTransactions({ height: data.height }) };
    } catch (error) {
      const local = await localChain(error);
      if (!local) throw error;
      const block = local.blocks.find((candidate) => candidate.height === data.height);
      if (!block) return null;
      return {
        block,
        transactions: local.transactions
          .filter((tx) => tx.block_height === data.height)
          .sort((a, b) => (a.block_index ?? 0) - (b.block_index ?? 0)),
      };
    }
  });

/** The local chain, or null when it is off and the caller should surface the original failure. */
async function localChain(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    !MISSING_MODULES.test(message) &&
    !MISSING_TABLES.test(message) &&
    !MISSING_BACKEND.test(message)
  )
    return null;
  try {
    const { devnet, devnetEnabled } = await import("./chain/devnet.server");
    return devnetEnabled() ? devnet() : null;
  } catch {
    return null;
  }
}

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
    let transaction: ChainTransaction | null = null;
    let block: ChainBlock | null = null;
    let siblings: ChainTransaction[] = [];
    try {
      const node = await import("./chain/node.server");
      transaction = await node.getTransaction(data.txid);
      if (!transaction) return null;
      if (transaction.block_height === null)
        return { transaction, block: null, proof: null, proofValid: null };
      [block, siblings] = await Promise.all([
        node.getBlock(transaction.block_height),
        node.listTransactions({ height: transaction.block_height }),
      ]);
    } catch (error) {
      const local = await localChain(error);
      if (!local) throw error;
      transaction = local.transactions.find((tx) => tx.txid === data.txid) ?? null;
      if (!transaction) return null;
      if (transaction.block_height === null)
        return { transaction, block: null, proof: null, proofValid: null };
      const height = transaction.block_height;
      block = local.blocks.find((candidate) => candidate.height === height) ?? null;
      siblings = local.transactions
        .filter((tx) => tx.block_height === height)
        .sort((a, b) => (a.block_index ?? 0) - (b.block_index ?? 0));
    }

    const { merkleProof, verifyMerkleProof } = await import("./chain/merkle");
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
  reconciliation: {
    companyId: string;
    ledgerUnits: number;
    chainUnits: number;
    reservedLedgerUnits?: number;
    reservedChainUnits?: number;
  }[];
  missingAnchors: { orderId: string; version: number; kind: "delivery" | "report" }[];
  /** False when there was no credit ledger to compare against, so that question went unasked. */
  ledgerCompared: boolean;
  checkedAt: string;
};

// Verification is deliberately exposed to anyone: the point of the layer is that the record can
// be audited without trusting this server. A divergence is returned, never swallowed.
//
// Three different questions are asked, because no single one covers the others. Validation asks
// whether the entries present are internally sound. Reconciliation asks whether the balances
// they derive match the ledger. Coverage asks whether an artefact exists with no anchor at all —
// which the other two cannot see, since an anchor moves no value and its absence leaves every
// balance correct.
export const auditChain = createServerFn({ method: "POST" }).handler(
  async (): Promise<ChainAudit> => {
    try {
      const node = await import("./chain/node.server");
      const { auditAnchorCoverage } = await import("./chain-bridge.server");
      const [validation, reconciliation, missingAnchors] = await Promise.all([
        node.verifyStoredChain(),
        node.reconcileWithLedger(),
        auditAnchorCoverage(),
      ]);
      return {
        validation,
        reconciliation,
        missingAnchors,
        ledgerCompared: true,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      const local = await localChain(error);
      if (!local) throw error;
      // The local chain has no credit ledger behind it, so reconciliation is left unanswered
      // rather than answered with an agreement that was never checked.
      const { validateChain } = await import("./chain/validate");
      const { unprovenSlashes } = await import("./chain/economy");
      const byHeight: Record<number, ChainTransaction[]> = {};
      for (const tx of local.transactions) (byHeight[tx.block_height as number] ??= []).push(tx);
      for (const height of Object.keys(byHeight))
        byHeight[Number(height)]?.sort((a, b) => (a.block_index ?? 0) - (b.block_index ?? 0));
      return {
        validation: validateChain([...local.blocks].reverse(), byHeight),
        reconciliation: [],
        missingAnchors: unprovenSlashes(local.transactions).map((tx) => ({
          orderId: tx.ref_id ?? "",
          version: 0,
          kind: "report" as const,
        })),
        ledgerCompared: false,
        checkedAt: new Date().toISOString(),
      };
    }
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
