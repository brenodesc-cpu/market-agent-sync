import { z } from "zod";

export const MAX_BRIEF_ROUNDS = 3;

export const missionBriefAnswerSchema = z.object({
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(1).max(2000),
});

export const missionBriefInputSchema = z.object({
  objective: z.string().trim().min(10).max(6000),
  answers: z.array(missionBriefAnswerSchema).max(9).default([]),
  round: z.number().int().min(0).max(MAX_BRIEF_ROUNDS),
});

export const missionBriefModelSchema = z.object({
  ready: z.boolean(),
  understanding: z.string().trim().min(10).max(2000),
  questions: z.array(z.string().trim().min(3).max(500)).max(3).default([]),
  consolidatedBrief: z.string().trim().max(6000).optional().default(""),
});

export const missionBriefStateSchema = z
  .object({
    ready: z.boolean(),
    round: z.number().int().min(0).max(MAX_BRIEF_ROUNDS),
    understanding: z.string().trim().min(10).max(2000),
    questions: z.array(z.string().trim().min(3).max(500)).max(3),
    consolidatedBrief: z.string().trim().max(6000).nullable(),
  })
  .superRefine((value, context) => {
    if (value.ready && (!value.consolidatedBrief || value.questions.length > 0))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Um briefing pronto exige texto consolidado e nenhuma pergunta.",
      });
    if (!value.ready && (value.questions.length === 0 || value.consolidatedBrief !== null))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Um briefing incompleto exige de uma a três perguntas.",
      });
  });

export type MissionBriefAnswer = z.infer<typeof missionBriefAnswerSchema>;
export type MissionBriefInput = z.infer<typeof missionBriefInputSchema>;
export type MissionBriefState = z.infer<typeof missionBriefStateSchema>;

function fallbackBrief(input: MissionBriefInput) {
  const answers = input.answers.length
    ? `\n\nRespostas confirmadas:\n${input.answers
        .map(({ question, answer }) => `- ${question}: ${answer}`)
        .join("\n")}`
    : "";
  return `${input.objective}${answers}\n\nUse somente estas informações. Declare qualquer premissa necessária na entrega.`;
}

export function resolveMissionBriefState(
  value: unknown,
  rawInput: MissionBriefInput,
): MissionBriefState {
  const input = missionBriefInputSchema.parse(rawInput);
  const decision = missionBriefModelSchema.parse(value);
  const canAsk = !decision.ready && decision.questions.length > 0 && input.round < MAX_BRIEF_ROUNDS;
  if (canAsk)
    return missionBriefStateSchema.parse({
      ready: false,
      round: input.round,
      understanding: decision.understanding,
      questions: decision.questions,
      consolidatedBrief: null,
    });
  return missionBriefStateSchema.parse({
    ready: true,
    round: input.round,
    understanding: decision.understanding,
    questions: [],
    consolidatedBrief: decision.consolidatedBrief || fallbackBrief(input),
  });
}
