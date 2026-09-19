import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { companyDraftSchema, catalogueRowsSchema, orderRequestSchema } from "./a2a-contract";

export const getStudioBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const { catalogueOffers, publicDb } = await import("./studio-runtime.server");
  let offers: Awaited<ReturnType<typeof catalogueOffers>> = [];
  let setupMessage: string | null = null;
  let missionPersistenceConfigured = false;
  try {
    offers = await catalogueOffers();
  } catch {
    setupMessage = "O marketplace ainda precisa ser ativado no banco do projeto.";
  }
  if (process.env["SUPABASE_URL"] && process.env["SUPABASE_PUBLISHABLE_KEY"]) {
    try {
      const probe = await publicDb()
        .from("autonomous_missions")
        .select("id", { count: "exact", head: true });
      missionPersistenceConfigured = !probe.error || probe.error.code === "42501";
      if (!missionPersistenceConfigured && !setupMessage)
        setupMessage = "As missões autônomas ainda precisam ser ativadas no banco do projeto.";
    } catch {
      missionPersistenceConfigured = false;
    }
  }
  return {
    offers,
    setupMessage,
    backendConfigured: Boolean(
      process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"],
    ),
    neuralakeConfigured: Boolean(process.env["NEURALAKE_API_KEY"]),
    missionPersistenceConfigured,
    agoraConfigured: Boolean(
      process.env["AGORA_APP_ID"] &&
      process.env["AGORA_APP_CERTIFICATE"] &&
      process.env["AGORA_REVIEW_SECRET"] &&
      process.env["NEURALAKE_API_KEY"] &&
      process.env["PUBLIC_APP_URL"] &&
      process.env["AGORA_TTS_VOICE_ID"],
    ),
  };
});
export const previewCatalogue = createServerFn({ method: "POST" })
  .validator(z.object({ rows: catalogueRowsSchema, testFailure: z.boolean() }))
  .handler(async ({ data }) => {
    const { createCatalogueCsv, verifyCatalogue } = await import("./a2a-contract");
    const { createHash } = await import("node:crypto");
    const content = createCatalogueCsv(data.rows, data.testFailure);
    return {
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
      ...verifyCatalogue(data.rows, content),
    };
  });
export const getStudioWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    (await import("./studio-runtime.server")).workspace(context.userId),
  );
export const generateCompanyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      prompt: z.string().trim().min(3).max(3000),
      current: companyDraftSchema.optional(),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./studio-runtime.server")).draftWithAI(data.prompt, data.current),
  );
export const publishCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ requestId: z.string().uuid(), draft: companyDraftSchema }))
  .handler(
    async ({ data, context }) =>
      (await import("./studio-runtime.server")).rpc("studio_create_company", {
        _user: context.userId,
        _request: data.requestId,
        _config: data.draft,
      }) as Promise<{ companyId: string; offerId: string }>,
  );
export const placeStudioOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orderRequestSchema)
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).createOrder(context.userId, data),
  );
export const executeStudioOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).runOrder(context.userId, data.orderId),
  );
export const getStudioOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid(), companyId: z.string().uuid().optional() }))
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).orderDetails(
      context.userId,
      data.orderId,
      data.companyId,
    ),
  );
export const cancelStudioOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).rpc("studio_cancel_order", {
      _user: context.userId,
      _order: data.orderId,
    }),
  );
export const createAgentKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).mintAgentCredential(context.userId, data.companyId),
  );
export const revokeAgentKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ credentialId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { runtimeDb } = await import("./studio-runtime.server");
    const db = await runtimeDb();
    const result = await db
      .from("agent_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.credentialId)
      .eq("created_by", context.userId);
    if (result.error) throw new Error("Não foi possível revogar a credencial.");
    return { revoked: true };
  });
export const addReviewClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      orderId: z.string().uuid(),
      deliveryVersion: z.number().int().positive(),
      note: z.string().trim().min(3).max(1500),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).rpc("studio_add_clarification", {
      _user: context.userId,
      _order: data.orderId,
      _version: data.deliveryVersion,
      _note: data.note,
    }),
  );

export const submitHumanReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      orderId: z.string().uuid(),
      deliveryId: z.string().uuid(),
      reportId: z.string().uuid(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      decision: z.enum(["approved", "rejected"]),
      note: z.string().trim().min(3).max(1500),
    }),
  )
  .handler(async ({ data, context }) => {
    const { rpc, orderDetails } = await import("./studio-runtime.server");
    await rpc("studio_review_delivery", {
      _user: context.userId,
      _order: data.orderId,
      _delivery: data.deliveryId,
      _report: data.reportId,
      _sha: data.sha256,
      _decision: data.decision,
      _note: data.note,
    });
    return orderDetails(context.userId, data.orderId);
  });

export const executePrivateService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      requestId: z.string().uuid(),
      rows: catalogueRowsSchema,
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).executePrivate(
      context.userId,
      data.companyId,
      data.requestId,
      data.rows,
    ),
  );

export const setCompanyCommercial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ companyId: z.string().uuid(), enabled: z.boolean() }))
  .handler(async ({ data, context }) =>
    (await import("./studio-runtime.server")).rpc("studio_set_commercial", {
      _user: context.userId,
      _company: data.companyId,
      _enabled: data.enabled,
    }),
  );
