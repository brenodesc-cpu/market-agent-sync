import test from "node:test";
import assert from "node:assert/strict";
import { issueReviewSession, resolveReviewSession } from "../src/lib/review-session.server.ts";

const secret = "test-secret-only-32-characters-long";
const input = {
  reviewId: "00000000-0000-0000-0000-000000000001",
  ownerId: "00000000-0000-0000-0000-000000000002",
  reportId: "00000000-0000-0000-0000-000000000003",
};
test("voice credential binds user, order, report and five-minute expiry", () => {
  const { token, expiresAt } = issueReviewSession(input, secret, 1000);
  assert.deepEqual(resolveReviewSession(token, secret, 1001), { ...input, expiresAt });
  assert.equal(resolveReviewSession(token, secret, expiresAt), null);
  assert.equal(resolveReviewSession(`${token}x`, secret, 1001), null);
  assert.equal(resolveReviewSession(token, secret + "another", 1001), null);
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...input, ownerId: input.reviewId, expiresAt })).toString(
    "base64url",
  );
  assert.equal(resolveReviewSession(parts.join("."), secret, 1001), null);
});
test("missing secret never creates a public voice credential", () => {
  assert.throws(() => issueReviewSession(input, undefined));
  assert.throws(() => issueReviewSession(input, "short"));
});
