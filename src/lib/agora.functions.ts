import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startReviewCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { loadReviewEvidence } = await import("./review-data.server");
    const { issueReviewSession } = await import("./review-session.server");
    const { agoraConfiguration, startAgoraVoice } = await import("./agora-provider.server");
    const config = agoraConfiguration();
    const evidence = await loadReviewEvidence(context.supabase, data.orderId);
    if (!evidence.report) throw new Error("Registre uma verificação antes de iniciar a conversa.");
    const session = issueReviewSession(
      { reviewId: data.orderId, ownerId: context.userId, reportId: evidence.report.id },
      config.secret,
    );
    const call = await startAgoraVoice(config, context.userId, data.orderId, session.token);
    const { runtimeDb } = await import("./studio-runtime.server");
    const db = await runtimeDb();
    await db
      .from("order_events")
      .insert({
        order_id: data.orderId,
        actor_type: "human",
        actor_label: "Responsável em revisão com Agora",
        event_type: "voice_review_started",
        result: "Sessão de voz aberta para conferir as evidências antes do aceite.",
        metadata: { reportId: evidence.report.id, userId: context.userId },
      });
    return call;
  });
export const stopReviewCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ control: z.string().min(10).max(2048) }))
  .handler(async ({ data, context }) => {
    const { agoraConfiguration, stopAgoraVoice } = await import("./agora-provider.server");
    return stopAgoraVoice(agoraConfiguration(), context.userId, data.control);
  });
