import type {
  ChainTransaction,
  ListingTier,
  Reputation,
  StakePosition,
  TransactionPayload,
} from "./types.ts";

// The NMK economy, derived from the signed history and nothing else.
//
// Every function here is pure: given the same transactions, anyone recomputes the same
// collateral positions, the same listing tier and the same reputation, without this server and
// without the database. That is the whole point — a supplier's record has to be checkable by
// the buyer who is deciding whether to trust it.
//
// The rules themselves are stated in docs/nmk-economy.md.

/** Floor for any offer, so a very cheap offer still costs something to publish. */
export const MIN_OFFER_STAKE_UNITS = 100;

/** Collateral has to cover the worst case burn with room to spare. */
export const OFFER_STAKE_MULTIPLIER = 3;

export const LISTING_TIERS: readonly ListingTier[] = [
  { name: "Sem colateral", minUnits: 0, maxPublishedOffers: 0 },
  { name: "Base", minUnits: 300, maxPublishedOffers: 2 },
  { name: "Crescimento", minUnits: 1500, maxPublishedOffers: 8 },
  { name: "Escala", minUnits: 6000, maxPublishedOffers: 30 },
];

function assertUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0))
    throw new Error(`${label} precisa ser um inteiro não negativo.`);
}

/** Collateral an offer must hold before it can receive orders. */
export function requiredStakeForOffer(priceUnits: number): number {
  assertUnits(priceUnits, "O preço da oferta");
  return Math.max(MIN_OFFER_STAKE_UNITS, priceUnits * OFFER_STAKE_MULTIPLIER);
}

/**
 * How much of the collateral a proven failure costs.
 *
 * Bounded by the contract price, because the harm to the buyer is what they would have paid,
 * and bounded by the collateral, because nothing more than that was ever locked. The result
 * goes entirely to the buyer: see section 5 of the economy contract for why the platform
 * deliberately takes none of it.
 */
export function slashUnits(activeStakeUnits: number, contractPriceUnits: number): number {
  assertUnits(activeStakeUnits, "O colateral travado");
  assertUnits(contractPriceUnits, "O preço do contrato");
  return Math.min(activeStakeUnits, contractPriceUnits);
}

export function listingTier(activeStakeUnits: number): ListingTier {
  assertUnits(activeStakeUnits, "O colateral travado");
  let current = LISTING_TIERS[0] as ListingTier;
  for (const tier of LISTING_TIERS) if (activeStakeUnits >= tier.minUnits) current = tier;
  return current;
}

/**
 * Collateral per offer, from the signed history.
 *
 * The address comes from whoever staked first on that offer, which is what makes attribution
 * possible: a burn names the offer, and the offer names the supplier who put collateral behind
 * it. Without that link a burn would float free of anyone responsible for it.
 */
export function deriveStakes(transactions: readonly ChainTransaction[]): StakePosition[] {
  const positions = new Map<string, StakePosition>();
  const open = (offerId: string, address: string) => {
    const existing = positions.get(offerId);
    if (existing) return existing;
    const created: StakePosition = {
      offerId,
      address,
      stakedUnits: 0,
      releasedUnits: 0,
      slashedUnits: 0,
      activeUnits: 0,
    };
    positions.set(offerId, created);
    return created;
  };

  for (const tx of transactions) {
    if (tx.ref_kind !== "offer" || tx.ref_id === null) continue;
    if (tx.type === "STAKE") {
      if (tx.from === null) continue;
      const position = open(tx.ref_id, tx.from);
      position.stakedUnits += tx.amount;
    } else if (tx.type === "UNSTAKE") {
      if (tx.to === null) continue;
      const position = open(tx.ref_id, tx.to);
      position.releasedUnits += tx.amount;
    } else if (tx.type === "SLASH") {
      const position = positions.get(tx.ref_id);
      // A burn on an offer that was never staked is not attributable, and silently inventing a
      // position for it would hide exactly the inconsistency an audit needs to surface.
      if (!position) continue;
      position.slashedUnits += tx.amount;
    }
  }

  for (const position of positions.values())
    position.activeUnits = position.stakedUnits - position.releasedUnits - position.slashedUnits;
  return [...positions.values()];
}

/**
 * What a buyer can verify about a supplier before contracting.
 *
 * Earnings count settled payouts addressed to the supplier. Burns are attributed through the
 * offer they were charged against, never asserted directly, so a burn always traces back to a
 * collateral position that supplier opened.
 */
export function deriveReputation(transactions: readonly ChainTransaction[]): Reputation[] {
  const stakes = deriveStakes(transactions);
  const offerOwner = new Map(stakes.map((position) => [position.offerId, position.address]));
  const reputations = new Map<string, Reputation>();
  const open = (address: string) => {
    const existing = reputations.get(address);
    if (existing) return existing;
    const created: Reputation = {
      address,
      settledContracts: 0,
      earnedUnits: 0,
      slashes: 0,
      slashedUnits: 0,
      activeStakeUnits: 0,
    };
    reputations.set(address, created);
    return created;
  };

  for (const position of stakes) open(position.address).activeStakeUnits += position.activeUnits;

  for (const tx of transactions) {
    if (tx.type === "TRANSFER" && tx.ref_kind === "order" && tx.to !== null) {
      const reputation = open(tx.to);
      reputation.settledContracts += 1;
      reputation.earnedUnits += tx.amount;
    } else if (tx.type === "SLASH" && tx.ref_kind === "offer" && tx.ref_id !== null) {
      const owner = offerOwner.get(tx.ref_id);
      if (!owner) continue;
      const reputation = open(owner);
      reputation.slashes += 1;
      reputation.slashedUnits += tx.amount;
    }
  }
  return [...reputations.values()];
}

export type StakeCheck =
  | { allowed: true }
  | { allowed: false; reason: string; requiredUnits: number; activeUnits: number };

/** Whether an offer may receive orders, stated the way the interface has to explain it. */
export function canOfferReceiveOrders(
  priceUnits: number,
  activeStakeUnits: number,
  publishedOffers: number,
  totalActiveStakeUnits: number,
): StakeCheck {
  const requiredUnits = requiredStakeForOffer(priceUnits);
  if (activeStakeUnits < requiredUnits)
    return {
      allowed: false,
      reason: `Esta oferta exige ${requiredUnits} NMK de colateral travado e tem ${activeStakeUnits}.`,
      requiredUnits,
      activeUnits: activeStakeUnits,
    };
  const tier = listingTier(totalActiveStakeUnits);
  if (publishedOffers > tier.maxPublishedOffers)
    return {
      allowed: false,
      reason: `O nível ${tier.name} publica ${tier.maxPublishedOffers} ofertas ao mesmo tempo, e a empresa tem ${publishedOffers}.`,
      requiredUnits,
      activeUnits: activeStakeUnits,
    };
  return { allowed: true };
}

/**
 * Burns whose justifying report is not anchored in the record.
 *
 * A burn carries the hash of the verification report that justified it, and that report is
 * anchored when it is produced. A burn pointing at a hash no anchor contains is either a burn
 * without evidence or evidence that was never recorded. Both need to be visible: this is the
 * check that keeps the platform from being able to burn collateral on its own say-so.
 */
export function unprovenSlashes(transactions: readonly ChainTransaction[]): ChainTransaction[] {
  const anchored = new Set(
    transactions
      .filter((tx) => tx.type === "ANCHOR" && tx.ref_kind === "report" && tx.payload_hash !== null)
      .map((tx) => tx.payload_hash as string),
  );
  return transactions.filter(
    (tx) => tx.type === "SLASH" && (tx.payload_hash === null || !anchored.has(tx.payload_hash)),
  );
}

/** Business figures, derived from the record rather than from a separate reporting table. */
export type EconomySummary = {
  contractedUnits: number;
  supplierPayoutUnits: number;
  platformFeeUnits: number;
  lockedCollateralUnits: number;
  burnedCollateralUnits: number;
  issuedUnits: number;
  redeemedUnits: number;
};

export function summariseEconomy(transactions: readonly ChainTransaction[]): EconomySummary {
  const summary: EconomySummary = {
    contractedUnits: 0,
    supplierPayoutUnits: 0,
    platformFeeUnits: 0,
    lockedCollateralUnits: 0,
    burnedCollateralUnits: 0,
    issuedUnits: 0,
    redeemedUnits: 0,
  };
  for (const tx of transactions) {
    if (tx.type === "TRANSFER" && tx.ref_kind === "order") summary.supplierPayoutUnits += tx.amount;
    else if (tx.type === "FEE") summary.platformFeeUnits += tx.amount;
    else if (tx.type === "MINT") summary.issuedUnits += tx.amount;
    else if (tx.type === "REDEEM") summary.redeemedUnits += tx.amount;
    else if (tx.type === "SLASH") summary.burnedCollateralUnits += tx.amount;
  }
  // Contracted value is the payout plus the fee, never the two added to something else: the
  // roadmap requires these three to stay separable and never collapse into one number.
  summary.contractedUnits = summary.supplierPayoutUnits + summary.platformFeeUnits;
  summary.lockedCollateralUnits = deriveStakes(transactions).reduce(
    (total, position) => total + position.activeUnits,
    0,
  );
  return summary;
}

/** NMK is collateral, not money between companies. */
export function isTransferBetweenCompanies(tx: TransactionPayload): boolean {
  return tx.type === "TRANSFER" && tx.ref_kind !== "order";
}
