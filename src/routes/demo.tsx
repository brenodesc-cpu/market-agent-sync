import { createFileRoute } from "@tanstack/react-router";
import { FinancialPitchDemo } from "@/components/financial-pitch-demo";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "NeuraMarket | Uma contratação entre agentes" },
      {
        name: "description",
        content:
          "Demonstração ilustrada de uma contratação de câmbio, com orçamento, comparação de ofertas e aprovação humana.",
      },
    ],
  }),
  component: FinancialPitchDemo,
});
