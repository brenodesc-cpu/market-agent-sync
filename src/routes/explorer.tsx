import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChainExplorer } from "@/components/chain-explorer";
import { getChainOverview } from "@/lib/chain.functions";

export const Route = createFileRoute("/explorer")({
  validateSearch: z.object({
    bloco: z.number().int().min(0).optional(),
    tx: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  }),
  loader: () => getChainOverview(),
  head: () => ({
    meta: [
      { title: "Registro NMK | NeuraMarket" },
      {
        name: "description",
        content:
          "Registro público e assinado dos contratos, entregas verificadas e liquidações da NeuraMarket.",
      },
      { property: "og:title", content: "Registro NMK | NeuraMarket" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ExplorerRoute,
});

function ExplorerRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <ChainExplorer data={data} selectedHeight={search.bloco} selectedTxid={search.tx} />;
}
