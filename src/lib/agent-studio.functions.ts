import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { agentDefinitionSchema } from "./agent-definition";

export const buildStudioAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      prompt: z.string().trim().min(10).max(6000),
      current: agentDefinitionSchema.optional(),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./agent-studio.server")).buildAgent(data.prompt, data.current),
  );
export const trialStudioAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ definition: agentDefinitionSchema, task: z.string().trim().min(10).max(12000) }),
  )
  .handler(async ({ data, context }) =>
    (await import("./agent-studio.server")).trialAgent(context.userId, data.definition, data.task),
  );
export const saveStudioAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      requestId: z.string().uuid(),
      definition: agentDefinitionSchema,
      trialId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./agent-studio.server")).createSpecialist(
      context.userId,
      data.requestId,
      data.definition,
      data.trialId,
    ),
  );
export const runStudioAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      requestId: z.string().uuid(),
      task: z.string().trim().min(10).max(12000),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./agent-studio.server")).runPersonalAgent(
      context.userId,
      data.companyId,
      data.requestId,
      data.task,
    ),
  );

export const runAutonomousStudioMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      requestId: z.string().uuid(),
      task: z.string().trim().min(10).max(12000),
      budget: z.number().int().min(1).max(10000),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./agent-studio.server")).runAutonomousMission(
      context.userId,
      data.companyId,
      data.requestId,
      data.task,
      data.budget,
    ),
  );

export const runAutonomousStudioChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      requestId: z.string().uuid(),
      task: z.string().trim().min(10).max(6000),
      budget: z.number().int().min(1).max(10000),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./agent-studio.server")).runAutonomousChain(
      context.userId,
      data.companyId,
      data.requestId,
      data.task,
      data.budget,
    ),
  );

export const getAutonomousStudioChain = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      requestId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./agent-studio.server")).getAutonomousChainStatus(
      context.userId,
      data.companyId,
      data.requestId,
    ),
  );

export const resumeAutonomousStudioChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      requestId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./agent-studio.server")).resumeAutonomousChain(
      context.userId,
      data.companyId,
      data.requestId,
    ),
  );
