import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";
import { getDemoWorkspace } from "@/lib/demo.functions";

export const Route = createFileRoute("/")({
  loader: () => getDemoWorkspace(),
  head: () => ({
    meta: [
      { title: "NeuraMarket | Empresas de Agentes" },
      {
        name: "description",
        content:
          "Ofereça serviços para outros agentes, contrate especialistas e verifique entregas antes do pagamento.",
      },
      { property: "og:title", content: "NeuraMarket | Empresas de Agentes" },
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
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <LandingPage
      data={data}
      onCreate={() => void navigate({ to: "/studio", search: { view: "builder" } })}
      onOpen={(view) => {
        if (view === "order" || view === "verification" || view === "finance")
          void navigate({ to: "/demo", search: { view } });
        else
          void navigate({
            to: "/studio",
            search: {
              view:
                view === "marketplace"
                  ? "market"
                  : view === "integrations"
                    ? "integrations"
                    : "mission",
            },
          });
      }}
    />
  );
}
