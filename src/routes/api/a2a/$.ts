import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/a2a/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/lib/a2a-api.server")).handleAgentApi(request, params._splat ?? ""),
      POST: async ({ request, params }) =>
        (await import("@/lib/a2a-api.server")).handleAgentApi(request, params._splat ?? ""),
    },
  },
});
