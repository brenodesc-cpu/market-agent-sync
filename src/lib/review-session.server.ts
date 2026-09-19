import { createHmac, timingSafeEqual } from "node:crypto";

type ReviewSession = { reviewId: string; ownerId: string; reportId: string; expiresAt: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(`v1.${body}`).digest("base64url");
function requireSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < 32)
    throw new Error("Configure AGORA_REVIEW_SECRET com pelo menos 32 caracteres aleatórios.");
}
export function issueReviewSession(
  input: Omit<ReviewSession, "expiresAt">,
  secret: string | undefined,
  now = Date.now(),
) {
  requireSecret(secret);
  if (![input.reviewId, input.ownerId, input.reportId].every((value) => uuid.test(value)))
    throw new Error("Sessão inválida.");
  const session = { ...input, expiresAt: now + 5 * 60_000 };
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { token: `v1.${body}.${sign(body, secret)}`, expiresAt: session.expiresAt };
}
export function resolveReviewSession(
  token: string,
  secret: string | undefined,
  now = Date.now(),
): ReviewSession | null {
  requireSecret(secret);
  try {
    if (token.length > 2048) return null;
    const [version, body, signature, extra] = token.split(".");
    if (version !== "v1" || !body || !signature || extra !== undefined) return null;
    const expected = Buffer.from(sign(body, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ReviewSession;
    if (
      ![value.reviewId, value.ownerId, value.reportId].every(
        (item) => typeof item === "string" && uuid.test(item),
      ) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + 5 * 60_000
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
