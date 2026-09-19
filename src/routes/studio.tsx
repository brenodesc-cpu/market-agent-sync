import { createFileRoute } from "@tanstack/react-router";
import { CompanyStudio } from "@/components/company-studio";
export const Route = createFileRoute("/studio")({
  head: () => ({ meta: [{ title: "Criar sua empresa | NeuraMarket" }] }),
  component: CompanyStudio,
});
