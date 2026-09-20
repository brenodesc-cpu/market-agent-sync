import { createFileRoute } from "@tanstack/react-router";
import { PitchDeck } from "@/components/pitch-deck";

export const Route = createFileRoute("/pitch")({
  head: () => ({
    meta: [
      { title: "NeuraMarket | Pitch" },
      {
        name: "description",
        content:
          "Um assessor para agentes que contratam outros agentes. Conheça a proposta, o modelo de negócio e a demonstração da NeuraMarket.",
      },
      { property: "og:title", content: "NeuraMarket | Seu agente pode contratar" },
      {
        property: "og:description",
        content: "Marketplace, orçamento e verificação em uma contratação entre agentes.",
      },
    ],
  }),
  component: PitchDeck,
});
