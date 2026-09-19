// Run with: node --experimental-strip-types --test tests/economy.test.ts
// Pure: no database, no network, no environment. Everything here is recomputable by anyone
// holding the public record, which is the property the economy depends on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { generateKeyPair, deriveAddress } from "../src/lib/chain/keys.ts";
import { buildTransaction, assertTransactionPayload } from "../src/lib/chain/tx.ts";
import {
  CHAIN_ID,
  type ChainTransaction,
  type TransactionPayload,
} from "../src/lib/chain/types.ts";
import {
  LISTING_TIERS,
  MIN_OFFER_STAKE_UNITS,
  canOfferReceiveOrders,
  deriveReputation,
  deriveStakes,
  listingTier,
  requiredStakeForOffer,
  slashUnits,
  summariseEconomy,
  unprovenSlashes,
} from "../src/lib/chain/economy.ts";

const OFFER = "1f8b4f6e-0000-4000-8000-000000000001";
const ORDER = "1f8b4f6e-0000-4000-8000-000000000002";
const reportHash = createHash("sha256").update("relatorio reprovado", "utf8").digest("hex");

function wallet() {
  const pair = generateKeyPair();
  return { ...pair, address: deriveAddress(pair.publicKey) };
}

const supplier = wallet();
const buyer = wallet();
const stakeEscrow = wallet();
const platform = wallet();

let nonce = 0;
function sign(
  signer: ReturnType<typeof wallet>,
  base: Partial<TransactionPayload> & Pick<TransactionPayload, "type">,
): ChainTransaction {
  const payload: TransactionPayload = {
    amount: 0,
    chain_id: CHAIN_ID,
    from: signer.address,
    issued_at: new Date(1789840000000 + nonce * 1000).toISOString(),
    memo: "",
    nonce: nonce++,
    payload_hash: null,
    ref_id: null,
    ref_kind: null,
    to: null,
    ...base,
  };
  return buildTransaction(payload, signer.privateKey, signer.publicKey);
}

const stake = (units: number) =>
  sign(supplier, {
    type: "STAKE",
    amount: units,
    to: stakeEscrow.address,
    ref_kind: "offer",
    ref_id: OFFER,
  });
const unstake = (units: number) =>
  sign(stakeEscrow, {
    type: "UNSTAKE",
    amount: units,
    to: supplier.address,
    ref_kind: "offer",
    ref_id: OFFER,
  });
const slash = (units: number, hash: string | null = reportHash) =>
  sign(stakeEscrow, {
    type: "SLASH",
    amount: units,
    to: buyer.address,
    ref_kind: "offer",
    ref_id: OFFER,
    payload_hash: hash,
  });
const reportAnchor = (hash: string) =>
  sign(supplier, { type: "ANCHOR", payload_hash: hash, ref_kind: "report", ref_id: ORDER });
const payout = (units: number) =>
  sign(stakeEscrow, {
    type: "TRANSFER",
    amount: units,
    to: supplier.address,
    ref_kind: "order",
    ref_id: ORDER,
  });

test("colateral exigido acompanha o preço e respeita o mínimo", () => {
  assert.equal(requiredStakeForOffer(0), MIN_OFFER_STAKE_UNITS);
  assert.equal(requiredStakeForOffer(10), MIN_OFFER_STAKE_UNITS);
  // The floor stops applying exactly where three times the price overtakes it.
  assert.equal(requiredStakeForOffer(33), MIN_OFFER_STAKE_UNITS);
  assert.equal(requiredStakeForOffer(34), 102);
  assert.equal(requiredStakeForOffer(72), 216);
  assert.throws(() => requiredStakeForOffer(-1), /inteiro não negativo/);
  assert.throws(() => requiredStakeForOffer(1.5), /inteiro não negativo/);
});

test("nível de listagem acerta cada faixa e as fronteiras exatas", () => {
  assert.equal(listingTier(0).maxPublishedOffers, 0);
  assert.equal(listingTier(299).name, "Sem colateral");
  assert.equal(listingTier(300).name, "Base");
  assert.equal(listingTier(1499).name, "Base");
  assert.equal(listingTier(1500).name, "Crescimento");
  assert.equal(listingTier(5999).name, "Crescimento");
  assert.equal(listingTier(6000).name, "Escala");
  assert.equal(listingTier(10_000_000).name, "Escala");
  // The tiers must stay ordered, or the scan that picks the highest match breaks silently.
  for (let i = 1; i < LISTING_TIERS.length; i++)
    assert.ok(
      (LISTING_TIERS[i] as { minUnits: number }).minUnits >
        (LISTING_TIERS[i - 1] as { minUnits: number }).minUnits,
    );
});

test("queima é limitada pelo menor entre colateral e preço, e nunca excede o travado", () => {
  assert.equal(slashUnits(300, 72), 72);
  assert.equal(slashUnits(50, 72), 50);
  assert.equal(slashUnits(0, 72), 0);
  assert.equal(slashUnits(300, 0), 0);
  for (const [locked, price] of [
    [300, 72],
    [50, 900],
    [1, 1],
  ] as const)
    assert.ok(slashUnits(locked, price) <= locked, "a queima passou do colateral travado");
});

test("STAKE trava, UNSTAKE devolve e SLASH reduz a posição da oferta", () => {
  const positions = deriveStakes([stake(300), unstake(100), slash(72)]);
  assert.equal(positions.length, 1);
  const position = positions[0]!;
  assert.equal(position.offerId, OFFER);
  assert.equal(position.address, supplier.address);
  assert.equal(position.stakedUnits, 300);
  assert.equal(position.releasedUnits, 100);
  assert.equal(position.slashedUnits, 72);
  assert.equal(position.activeUnits, 128);
});

test("uma queima em oferta sem colateral não inventa posição nem some do registro", () => {
  const orphan = sign(stakeEscrow, {
    type: "SLASH",
    amount: 40,
    to: buyer.address,
    ref_kind: "offer",
    ref_id: "1f8b4f6e-0000-4000-8000-00000000dead",
    payload_hash: reportHash,
  });
  assert.deepEqual(deriveStakes([orphan]), []);
  // It is not attributable, so it must still be reachable as an inconsistency.
  assert.equal(unprovenSlashes([orphan]).length, 1);
});

test("SLASH sem o relatório que o justifica é rejeitado na validação da transação", () => {
  assert.throws(
    () =>
      assertTransactionPayload({
        amount: 72,
        chain_id: CHAIN_ID,
        from: stakeEscrow.address,
        issued_at: new Date(1789840000000).toISOString(),
        memo: "",
        nonce: 0,
        payload_hash: null,
        ref_id: OFFER,
        ref_kind: "offer",
        to: buyer.address,
        type: "SLASH",
      }),
    /Queima de colateral NMK inválida/,
  );
});

test("STAKE sem oferta nomeada é rejeitado, senão a queima não teria dono", () => {
  assert.throws(
    () =>
      assertTransactionPayload({
        amount: 300,
        chain_id: CHAIN_ID,
        from: supplier.address,
        issued_at: new Date(1789840000000).toISOString(),
        memo: "",
        nonce: 0,
        payload_hash: null,
        ref_id: null,
        ref_kind: null,
        to: stakeEscrow.address,
        type: "STAKE",
      }),
    /Movimentação de colateral NMK inválida/,
  );
});

test("queima cujo relatório não está ancorado é reportada; com o relatório, não é", () => {
  const withoutEvidence = [stake(300), slash(72)];
  assert.equal(unprovenSlashes(withoutEvidence).length, 1);

  const withEvidence = [stake(300), reportAnchor(reportHash), slash(72)];
  assert.deepEqual(unprovenSlashes(withEvidence), []);

  // A burn pointing at some other anchored report is still unproven for this burn.
  const otherHash = createHash("sha256").update("outro relatorio", "utf8").digest("hex");
  assert.equal(unprovenSlashes([stake(300), reportAnchor(otherHash), slash(72)]).length, 1);
});

test("reputação atribui a queima ao fornecedor dono do colateral daquela oferta", () => {
  const record = [stake(300), reportAnchor(reportHash), payout(65), slash(72)];
  const reputations = deriveReputation(record);
  const supplierReputation = reputations.find((r) => r.address === supplier.address);
  assert.ok(supplierReputation, "o fornecedor precisa aparecer na reputação");
  assert.equal(supplierReputation.settledContracts, 1);
  assert.equal(supplierReputation.earnedUnits, 65);
  assert.equal(supplierReputation.slashes, 1);
  assert.equal(supplierReputation.slashedUnits, 72);
  assert.equal(supplierReputation.activeStakeUnits, 228);

  // The burn is charged to the supplier, never to the buyer who received it.
  const buyerReputation = reputations.find((r) => r.address === buyer.address);
  assert.equal(buyerReputation, undefined);
});

test("reputação recalculada a partir do registro público bate com a interna", () => {
  const record = [stake(1500), reportAnchor(reportHash), payout(65), payout(80), slash(72)];
  const direct = deriveReputation(record);
  // Serialising and reading back is what an outside auditor does with the public record.
  const roundTrip = deriveReputation(JSON.parse(JSON.stringify(record)) as ChainTransaction[]);
  assert.deepEqual(roundTrip, direct);
});

test("oferta sem colateral suficiente não pode receber pedidos, e a razão é explicada", () => {
  const blocked = canOfferReceiveOrders(72, 100, 1, 300);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.allowed === false && blocked.reason.includes("216"));
  assert.ok(blocked.allowed === false && blocked.requiredUnits === 216);

  const allowed = canOfferReceiveOrders(72, 216, 1, 300);
  assert.equal(allowed.allowed, true);
});

test("o nível limita quantas ofertas ficam publicadas ao mesmo tempo", () => {
  // Base allows two; a third is refused even with collateral on the offer itself.
  assert.equal(canOfferReceiveOrders(72, 400, 2, 400).allowed, true);
  const overTier = canOfferReceiveOrders(72, 400, 3, 400);
  assert.equal(overTier.allowed, false);
  assert.ok(overTier.allowed === false && overTier.reason.includes("Base"));
  // Growing the collateral raises the ceiling rather than requiring a subscription.
  assert.equal(canOfferReceiveOrders(72, 400, 3, 1500).allowed, true);
});

test("o resumo separa contratado, repasse, taxa, colateral e queima", () => {
  const fee = sign(stakeEscrow, {
    type: "FEE",
    amount: 7,
    to: platform.address,
    ref_kind: "order",
    ref_id: ORDER,
  });
  const summary = summariseEconomy([
    stake(300),
    payout(65),
    fee,
    reportAnchor(reportHash),
    slash(72),
  ]);
  assert.equal(summary.supplierPayoutUnits, 65);
  assert.equal(summary.platformFeeUnits, 7);
  assert.equal(summary.contractedUnits, 72);
  assert.equal(summary.burnedCollateralUnits, 72);
  assert.equal(summary.lockedCollateralUnits, 228);
  // Payout and fee must stay separable: they are never collapsed into one figure.
  assert.equal(summary.contractedUnits, summary.supplierPayoutUnits + summary.platformFeeUnits);
});

test("nenhum caminho de colateral produz posição ativa negativa", () => {
  const positions = deriveStakes([stake(100), unstake(100), reportAnchor(reportHash)]);
  assert.equal(positions[0]!.activeUnits, 0);
});

test("a derivação não depende da ordem: o explorador lista do mais novo para o mais antigo", () => {
  const chronological = [stake(240), reportAnchor(reportHash), slash(80)];
  const newestFirst = [...chronological].reverse();

  const forwards = deriveStakes(chronological)[0]!;
  const backwards = deriveStakes(newestFirst)[0]!;
  assert.equal(forwards.activeUnits, 160);
  assert.deepEqual(backwards, forwards);

  // Reputation rides on the same derivation, so it has to survive the same reversal.
  const reputationBackwards = deriveReputation(newestFirst).find(
    (r) => r.address === supplier.address,
  );
  assert.equal(reputationBackwards?.activeStakeUnits, 160);
  assert.equal(reputationBackwards?.slashedUnits, 80);
});
