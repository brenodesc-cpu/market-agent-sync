import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CompanyStudio } from "@/components/company-studio";
export const Route = createFileRoute("/studio")({
  validateSearch: z.object({
    company: z.string().optional(),
    orderId: z.string().uuid().optional(),
    view: z
      .enum([
        "advisor",
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
  head: () => ({ meta: [{ title: "Estúdio de agentes | NeuraMarket" }] }),
  component: () => {
    const { view, company, orderId } = Route.useSearch();
    return (
      <CompanyStudio
        initialView={view ?? "mission"}
        {...(company ? { initialCompany: company } : {})}
        {...(orderId ? { initialOrderId: orderId } : {})}
      />
    );
  },
});
