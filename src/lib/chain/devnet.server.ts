import { createHash } from "node:crypto";
import { blockHash, GENESIS_PREV_HASH } from "./block.ts";
import { deriveAddress, generateKeyPair } from "./keys.ts";
import { merkleRoot } from "./merkle.ts";
import { buildTransaction } from "./tx.ts";
import { validateChain } from "./validate.ts";
import { requiredStakeForOffer, slashUnits } from "./economy.ts";
import {
  CHAIN_ID,
  type BlockHeader,
  type ChainBlock,
  type ChainTransaction,
  type TransactionPayload,
} from "./types.ts";

// A local development chain.
//
// The cryptography is real: real secp256k1 keys, real signatures, a real Merkle root, a real
// hash chain, and the result is run through the same validateChain an auditor would use before
// it is ever served. What is synthetic is the *scenario* — the companies and the two orders are
// made up so the record has something in it to look at.
//
// It exists because the migration has not been applied to any database, and a record nobody can
// open teaches nobody anything. It is never a substitute for the real record: the interface
// labels it, and it is refused outright in production.

const PURCHASE = "compra-simulada";

type Party = {
  name: string;
  address: string;
  publicKey: string;
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"];
};

export type Devnet = {
  blocks: ChainBlock[];
  transactions: ChainTransaction[];
  parties: { name: string; address: string }[];
  builtAt: string;
};

function party(name: string): Party {
  const pair = generateKeyPair();
  return { name, ...pair, address: deriveAddress(pair.publicKey) };
}

function hashOf(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function build(): Devnet {
  const treasury = party("Tesouraria NeuraMarket");
  const custody = party("Custódia de contratos");
  const stakeEscrow = party("Custódia de colateral");
  const platform = party("NeuraMarket");
  const buyer = party("Mila Comércio");
  const prisma = party("Prisma Motion");
  const veritas = party("Veritas Lab");

  const nonces = new Map<string, number>();
  const at = (step: number) => new Date(1789840000000 + step * 60_000).toISOString();
  let step = 0;

  const sign = (
    signer: Party,
    base: Partial<TransactionPayload> & Pick<TransactionPayload, "type">,
  ): ChainTransaction => {
    const nonce = nonces.get(signer.address) ?? 0;
    nonces.set(signer.address, nonce + 1);
    const payload: TransactionPayload = {
      amount: 0,
      chain_id: CHAIN_ID,
      from: signer.address,
      issued_at: at(step++),
      memo: "",
      nonce,
      payload_hash: null,
      ref_id: null,
      ref_kind: null,
      to: null,
      ...base,
    };
    return buildTransaction(payload, signer.privateKey, signer.publicKey);
  };

  const offerPrisma = "of000000-0000-4000-8000-00000000a001";
  const offerVeritas = "of000000-0000-4000-8000-00000000a002";
  const orderApproved = "or000000-0000-4000-8000-00000000b001";
  const orderFailed = "or000000-0000-4000-8000-00000000b002";

  // Issuance against a simulated purchase. The coin is backed by the purchase record, never
  // conjured: every mint names the purchase it answers to.
  const issuance = [
    sign(treasury, {
      type: "MINT",
      from: null,
      amount: 5000,
      to: buyer.address,
      ref_kind: "purchase",
      ref_id: PURCHASE,
      memo: "Compra simulada de NMK para colateral e contratos",
    }),
    sign(treasury, {
      type: "MINT",
      from: null,
      amount: 1200,
      to: prisma.address,
      ref_kind: "purchase",
      ref_id: PURCHASE,
      memo: "Compra simulada de NMK para colateral",
    }),
    sign(treasury, {
      type: "MINT",
      from: null,
      amount: 800,
      to: veritas.address,
      ref_kind: "purchase",
      ref_id: PURCHASE,
      memo: "Compra simulada de NMK para colateral",
    }),
  ];

  const pricePrisma = 72;
  const priceVeritas = 80;
  const collateral = [
    sign(prisma, {
      type: "STAKE",
      amount: requiredStakeForOffer(pricePrisma) + 84,
      to: stakeEscrow.address,
      ref_kind: "offer",
      ref_id: offerPrisma,
      memo: "Colateral da oferta de padronização de catálogo",
    }),
    sign(veritas, {
      type: "STAKE",
      amount: requiredStakeForOffer(priceVeritas),
      to: stakeEscrow.address,
      ref_kind: "offer",
      ref_id: offerVeritas,
      memo: "Colateral da oferta de padronização de catálogo",
    }),
  ];

  // Order one: delivered, verified, approved, settled.
  const approvedDelivery = hashOf("catalogo-v1.csv aprovado");
  const approvedReport = hashOf("relatorio aprovado v1");
  const fee = Math.floor((pricePrisma * 1000) / 10000);
  const settled = [
    sign(buyer, {
      type: "RESERVE",
      amount: pricePrisma,
      to: custody.address,
      ref_kind: "order",
      ref_id: orderApproved,
      memo: "Reserva do valor contratado",
    }),
    sign(prisma, {
      type: "ANCHOR",
      payload_hash: approvedDelivery,
      ref_kind: "delivery",
      ref_id: orderApproved,
      memo: "Entrega versão 1",
    }),
    sign(prisma, {
      type: "ANCHOR",
      payload_hash: approvedReport,
      ref_kind: "report",
      ref_id: orderApproved,
      memo: "Relatório da versão 1",
    }),
    sign(custody, {
      type: "TRANSFER",
      amount: pricePrisma - fee,
      to: prisma.address,
      ref_kind: "order",
      ref_id: orderApproved,
      memo: "Repasse ao fornecedor",
    }),
    sign(custody, {
      type: "FEE",
      amount: fee,
      to: platform.address,
      ref_kind: "order",
      ref_id: orderApproved,
      memo: "Taxa da plataforma",
    }),
  ];

  // Order two: rejected up to the revision limit, so the collateral answers for it. The burn
  // points at the second report, the one that exhausted the corrections.
  const failedDeliveryOne = hashOf("catalogo-v1.csv com preco alterado");
  const failedReportOne = hashOf("relatorio reprovado v1");
  const failedDeliveryTwo = hashOf("catalogo-v2.csv ainda incompleto");
  const failedReportTwo = hashOf("relatorio reprovado v2, limite de correcoes atingido");
  const burn = slashUnits(requiredStakeForOffer(priceVeritas), priceVeritas);
  const failed = [
    sign(buyer, {
      type: "RESERVE",
      amount: priceVeritas,
      to: custody.address,
      ref_kind: "order",
      ref_id: orderFailed,
      memo: "Reserva do valor contratado",
    }),
    sign(veritas, {
      type: "ANCHOR",
      payload_hash: failedDeliveryOne,
      ref_kind: "delivery",
      ref_id: orderFailed,
      memo: "Entrega versão 1",
    }),
    sign(veritas, {
      type: "ANCHOR",
      payload_hash: failedReportOne,
      ref_kind: "report",
      ref_id: orderFailed,
      memo: "Relatório da versão 1: reprovado",
    }),
    sign(veritas, {
      type: "ANCHOR",
      payload_hash: failedDeliveryTwo,
      ref_kind: "delivery",
      ref_id: orderFailed,
      memo: "Entrega versão 2",
    }),
    sign(veritas, {
      type: "ANCHOR",
      payload_hash: failedReportTwo,
      ref_kind: "report",
      ref_id: orderFailed,
      memo: "Relatório da versão 2: reprovado, limite de correções atingido",
    }),
    sign(custody, {
      type: "RELEASE",
      amount: priceVeritas,
      to: buyer.address,
      ref_kind: "order",
      ref_id: orderFailed,
      memo: "Devolução da reserva",
    }),
    sign(stakeEscrow, {
      type: "SLASH",
      amount: burn,
      to: buyer.address,
      ref_kind: "offer",
      ref_id: offerVeritas,
      payload_hash: failedReportTwo,
      memo: "Colateral devolvido ao comprador por falha comprovada",
    }),
  ];

  const grouped = [issuance, collateral, settled, failed];
  const blocks: ChainBlock[] = [];
  const transactions: ChainTransaction[] = [];

  const seal = (height: number, txs: ChainTransaction[]) => {
    const header: BlockHeader = {
      chain_id: CHAIN_ID,
      height,
      merkle_root: merkleRoot(txs.map((tx) => tx.txid)),
      prev_hash: blocks[height - 1]?.block_hash ?? GENESIS_PREV_HASH,
      sealed_at: at(step++),
      tx_count: txs.length,
      validator: treasury.address,
    };
    blocks.push({ ...header, block_hash: blockHash(header) });
    txs.forEach((tx, index) => {
      transactions.push({ ...tx, block_height: height, block_index: index, status: "sealed" });
    });
  };

  seal(0, []);
  grouped.forEach((txs, index) => seal(index + 1, txs));

  // Serving a chain that does not validate would teach exactly the wrong lesson about what the
  // record means, so the builder refuses rather than shipping something broken.
  const byHeight: Record<number, ChainTransaction[]> = {};
  for (const tx of transactions) (byHeight[tx.block_height as number] ??= []).push(tx);
  const validation = validateChain(blocks, byHeight);
  if (!validation.valid)
    throw new Error(
      `A cadeia local de desenvolvimento não passou na própria validação: ${validation.issues
        .map((issue) => issue.code)
        .join(", ")}`,
    );

  return {
    blocks: [...blocks].reverse(),
    transactions: [...transactions].reverse(),
    parties: [treasury, custody, stakeEscrow, platform, buyer, prisma, veritas].map((p) => ({
      name: p.name,
      address: p.address,
    })),
    builtAt: new Date().toISOString(),
  };
}

let cached: Devnet | null = null;

/**
 * Whether a local chain may be built at all.
 *
 * Keys are generated at build time, so the addresses change whenever the process restarts.
 * That is fine for a development aid and unacceptable for anything else, which is the second
 * reason this is refused outside development.
 */
export function devnetEnabled(): boolean {
  if (process.env["NODE_ENV"] === "production") return false;
  return process.env["NMK_DEVNET"] !== "0";
}

export function devnet(): Devnet {
  if (!devnetEnabled()) throw new Error("A cadeia local de desenvolvimento está desligada.");
  cached ??= build();
  return cached;
}
