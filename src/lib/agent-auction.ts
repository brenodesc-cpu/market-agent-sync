import type { AgentOffer } from "./a2a-contract";

export type SupplierReputation = {
  score: number;
  approved: number;
  rejected: number;
};

export type AgentBid = {
  offerVersionId: string;
  viability: number;
  approach: string;
  reason: string;
};

export type ScoredAgentBid = AgentBid & {
  companyId: string;
  companyName: string;
  price: number;
  reputation: SupplierReputation;
  viabilityScore: number;
  priceScore: number;
  totalScore: number;
};

const stopWords = new Set([
  "para",
  "com",
  "uma",
  "que",
  "das",
  "dos",
  "por",
  "seu",
  "sua",
  "este",
  "esta",
]);

function words(value: string) {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((word) => word.length >= 3 && !stopWords.has(word)) ?? [],
  );
}

function lexicalRelevance(offer: AgentOffer, objective: string, category: string) {
  const requested = words(`${objective} ${category}`);
  const supplied = words(
    `${offer.title} ${offer.description} ${offer.category ?? ""} ${offer.exampleTask ?? ""}`,
  );
  let overlap = 0;
  for (const word of requested) if (supplied.has(word)) overlap++;
  const categoryMatch =
    offer.category?.localeCompare(category, undefined, { sensitivity: "base" }) === 0 ? 2 : 0;
  return overlap + categoryMatch;
}

export function shortlistAuctionCandidates(
  offers: AgentOffer[],
  objective: string,
  category: string,
  budget: number,
  preferredOfferId?: string | null,
) {
  return offers
    .filter((offer) => offer.price <= budget)
    .map((offer) => ({
      offer,
      preferred: offer.id === preferredOfferId ? 1 : 0,
      relevance: lexicalRelevance(offer, objective, category),
    }))
    .sort(
      (a, b) =>
        b.preferred - a.preferred ||
        b.relevance - a.relevance ||
        a.offer.price - b.offer.price ||
        a.offer.id.localeCompare(b.offer.id),
    )
    .slice(0, 4)
    .map(({ offer }) => offer);
}

export function historicalReputation(approved: number, rejected: number): SupplierReputation {
  const safeApproved = Math.max(0, Math.floor(approved));
  const safeRejected = Math.max(0, Math.floor(rejected));
  return {
    approved: safeApproved,
    rejected: safeRejected,
    // Two virtual successes and two virtual failures keep new suppliers neutral.
    score: (safeApproved + 2) / (safeApproved + safeRejected + 4),
  };
}

export function scoreAuctionBids(
  bids: AgentBid[],
  offers: AgentOffer[],
  reputations: Map<string, SupplierReputation>,
  budget: number,
): ScoredAgentBid[] {
  return bids
    .flatMap((bid) => {
      const offer = offers.find(
        (candidate) => candidate.id === bid.offerVersionId && candidate.price <= budget,
      );
      if (!offer || bid.viability < 55) return [];
      const reputation = reputations.get(offer.companyId) ?? historicalReputation(0, 0);
      const viabilityScore = Math.min(1, Math.max(0, bid.viability / 100));
      const priceScore = Math.min(1, Math.max(0, 1 - offer.price / Math.max(1, budget)));
      const totalScore = viabilityScore * 0.55 + reputation.score * 0.3 + priceScore * 0.15;
      return [
        {
          ...bid,
          companyId: offer.companyId,
          companyName: offer.companyName,
          price: offer.price,
          reputation,
          viabilityScore,
          priceScore,
          totalScore,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        a.price - b.price ||
        a.offerVersionId.localeCompare(b.offerVersionId),
    );
}

export function selectAuctionWinner(
  bids: AgentBid[],
  offers: AgentOffer[],
  reputations: Map<string, SupplierReputation>,
  budget: number,
): ScoredAgentBid | null {
  return scoreAuctionBids(bids, offers, reputations, budget)[0] ?? null;
}
