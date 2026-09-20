import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fxStartSchema, fxGoalSchema } from "./fx-market";
async function company(user: string, id?: string): Promise<string> {
  const runtime = await import("./studio-runtime.server");
  if (id) {
    await runtime.ownedCompany(user, id);
    return id;
  }
  return runtime.rpc("browser_buyer", { _user: user });
}
export const getFxView = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ companyId: z.string().uuid().optional(), orderId: z.string().uuid().optional() }),
  )
  .handler(async ({ context, data }) =>
    JSON.stringify(
      await (
        await import("./fx-market.server")
      ).getFx(context.userId, await company(context.userId, data.companyId), data.orderId),
    ),
  );
export const startFxView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(fxStartSchema.extend({ companyId: z.string().uuid().optional() }))
  .handler(async ({ context, data }) =>
    JSON.stringify(
      await (
        await import("./fx-market.server")
      ).startFx(context.userId, await company(context.userId, data.companyId), data),
    ),
  );
export const startFxReviewView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(fxStartSchema.extend({ companyId: z.string().uuid().optional() }))
  .handler(async ({ context, data }) =>
    JSON.stringify(
      await (
        await import("./fx-market.server")
      ).startFxReview(context.userId, await company(context.userId, data.companyId), data),
    ),
  );
export const quoteFxView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(fxGoalSchema.extend({ companyId: z.string().uuid().optional() }))
  .handler(async ({ context, data }) =>
    JSON.stringify(
      await (
        await import("./fx-market.server")
      ).quoteFx(context.userId, await company(context.userId, data.companyId), data),
    ),
  );
export const hireFxView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid().optional(),
      quoteId: z.string().uuid(),
      supplierId: z.string(),
      authorizeSimulation: z.literal(true),
      testFailure: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) =>
    JSON.stringify(
      await (
        await import("./fx-market.server")
      ).hireFx(
        context.userId,
        await company(context.userId, data.companyId),
        data,
        data.supplierId,
      ),
    ),
  );
export const actFxView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid().optional(),
      orderId: z.string().uuid(),
      action: z.enum(["resume", "correct", "accept", "cancel"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const runtime = await import("./fx-market.server");
    const id = await company(context.userId, data.companyId);
    return JSON.stringify(
      data.action === "cancel"
        ? await runtime.cancelFx(context.userId, id, data.orderId)
        : await runtime.advanceFx(
            context.userId,
            id,
            data.orderId,
            ["correct", "accept"].includes(data.action),
          ),
    );
  });
