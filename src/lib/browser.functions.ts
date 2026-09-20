import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { browserPurchaseSchema } from "./browser-qa";
export const getBrowserSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    (await import("./browser-runtime.server")).browserSetup(context.userId),
  );
export const createBrowserWorkerKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    (await import("./browser-runtime.server")).browserWorkerKey(context.userId),
  );
export const buyBrowserTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(browserPurchaseSchema)
  .handler(async ({ context, data }) => {
    const runtime = await import("./browser-runtime.server");
    const setup = await runtime.browserSetup(context.userId);
    return runtime.purchaseBrowserTest(context.userId, setup.companyId, data);
  });
export const retryBrowserOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ context, data }) =>
    (await import("./browser-runtime.server")).retryBrowserTest(context.userId, data.orderId),
  );
