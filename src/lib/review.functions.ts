import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const explainReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid(), question: z.string().trim().min(1).max(1000) }))
  .handler(async ({ data, context }) => {
    const { loadReviewEvidence } = await import("./review-data.server");
    const { createNeuraLakeClient } = await import("./review-voice.server.mjs");
    const evidence = await loadReviewEvidence(context.supabase, data.orderId);
    const apiKey = process.env["NEURALAKE_API_KEY"];
    if (!apiKey)
      return { ok: false as const, message: "Configure NEURALAKE_API_KEY nos Secrets do Lovable." };
    try {
      const text = await createNeuraLakeClient({ apiKey })({
        review: evidence,
        question: data.question,
      });
      return { ok: true as const, text, evidence };
    } catch {
      return {
        ok: false as const,
        message: "A NeuraLake não respondeu. A verificação e o pagamento continuam como estavam.",
      };
    }
  });

// The server that starts Agora can call this to obtain a short-lived, read-only
// Custom LLM credential. No payment capability is granted to the voice session.
export const prepareReviewVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { loadReviewEvidence } = await import("./review-data.server");
    const { issueReviewSession } = await import("./review-session.server");
    const evidence = await loadReviewEvidence(context.supabase, data.orderId);
    if (!evidence.report)
      throw new Error("Registre uma verificação antes de iniciar a revisão por voz.");
    const session = issueReviewSession(
      { reviewId: data.orderId, ownerId: context.userId, reportId: evidence.report.id },
      process.env["AGORA_REVIEW_SECRET"],
    );
    return { ...session, endpointPath: `/api/reviews/${data.orderId}/chat/completions` };
  });
