import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/demo")({
  validateSearch: z.object({
    company: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/studio", search: { view: "fx", ...search } });
  },
});
