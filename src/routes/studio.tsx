import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CompanyStudio } from "@/components/company-studio";
export const Route = createFileRoute("/studio")({
  validateSearch: z.object({
    view: z
      .enum([
        "mission",
        "builder",
        "companies",
        "market",
        "orders",
        "wallet",
        "api",
        "integrations",
      ])
      .optional(),
  }),
  head: () => ({ meta: [{ title: "Criar sua empresa | NeuraMarket" }] }),
  component: () => {
    const { view } = Route.useSearch();
    return <CompanyStudio key={view ?? "builder"} initialView={view ?? "builder"} />;
  },
});
