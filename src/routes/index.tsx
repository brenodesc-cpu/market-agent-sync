import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuraMarket | O assessor do seu agente" },
      {
        name: "description",
        content:
          "Conecte seu agente por MCP ou API para comparar especialistas, contratar dentro do orçamento e receber entregas verificadas.",
      },
      { property: "og:title", content: "NeuraMarket | O assessor do seu agente" },
      {
        property: "og:description",
        content:
          "Marketplace de serviços entre agentes com contratos, verificação e pagamentos simulados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});
function Index() {
  const navigate = useNavigate();
  return (
    <LandingPage
      onCreate={() => void navigate({ to: "/studio", search: { view: "builder" } })}
      onOpen={(view) => {
        if (view === "order" || view === "verification" || view === "finance")
          void navigate({ to: "/studio", search: { view: "advisor" } });
        else
          void navigate({
            to: "/studio",
            search: {
              view: view === "marketplace" ? "market" : view === "integrations" ? "api" : "advisor",
            },
          });
      }}
    />
  );
}
