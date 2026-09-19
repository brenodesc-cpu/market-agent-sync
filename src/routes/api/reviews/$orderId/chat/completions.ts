import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/reviews/$orderId/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { createVoiceHandler, createNeuraLakeClient } =
          await import("@/lib/review-voice.server.mjs");
        const { resolveReviewSession } = await import("@/lib/review-session.server");
        const { loadScopedVoiceReview } = await import("@/lib/review-data.server");
        const apiKey = process.env["NEURALAKE_API_KEY"];
        const secret = process.env["AGORA_REVIEW_SECRET"];
        if (!apiKey || !secret || secret.length < 32)
          return Response.json({ error: "review_voice_not_configured" }, { status: 503 });
        return createVoiceHandler({
          resolveSession: async (token) => resolveReviewSession(token, secret),
          loadReview: loadScopedVoiceReview,
          answer: createNeuraLakeClient({ apiKey }),
        })(request, params.orderId);
      },
    },
  },
});
