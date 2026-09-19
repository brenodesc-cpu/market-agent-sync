export type VoiceSession = {
  reviewId: string;
  ownerId: string;
  expiresAt: number;
  reportId?: string;
};
export type Answer = (input: {
  review: unknown;
  question: string;
  signal?: AbortSignal;
}) => Promise<string>;
export function createNeuraLakeClient(config: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Answer;
export function createVoiceHandler(config: {
  resolveSession: (token: string) => Promise<VoiceSession | null>;
  loadReview: (reviewId: string, ownerId: string, reportId?: string) => Promise<unknown>;
  answer: Answer;
}): (request: Request, reviewId: string) => Promise<Response>;
