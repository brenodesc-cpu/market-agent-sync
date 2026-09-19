import test from "node:test";
import assert from "node:assert/strict";
import { establishOAuthSession, loginReturnUrl, loginCallbackError } from "../src/lib/auth-flow.ts";

test("local login stops before navigating to a missing broker", () => {
  for (const origin of ["http://127.0.0.1:3099", "http://localhost:3099", "http://[::1]:3099"])
    assert.throws(() => loginReturnUrl(origin + "/studio"), /prévia local/);
});
test("hosted login returns to the editor without copying auth URL parameters", () => {
  assert.equal(
    loginReturnUrl("https://market-agent-sync.lovable.app/demo?error=old#private"),
    "https://market-agent-sync.lovable.app/studio?view=builder",
  );
});
test("disabled Google and invalid callback produce actionable, non-provider-controlled messages", () => {
  assert.match(
    loginCallbackError(
      "https://app.test/studio#error=invalid_request&error_description=provider%20%27google%27%20is%20not%20supported",
    )!,
    /habilitado no Lovable/,
  );
  assert.match(
    loginCallbackError(
      "https://app.test/studio?error=invalid_request&error_description=redirect_uri%20is%20not%20allowed",
    )!,
    /endereço/,
  );
  assert.match(loginCallbackError("https://app.test/studio#error=access_denied")!, /cancelado/);
  assert.equal(loginCallbackError("https://app.test/studio#access_token=untouched"), null);
  assert.ok(
    !loginCallbackError("https://app.test/studio#error=unknown&error_description=SECRET")!.includes(
      "SECRET",
    ),
  );
});
test("provider error and redirect never try to create a session", async () => {
  const never = async () => {
    throw new Error("must not call");
  };
  await establishOAuthSession({ redirected: true }, never);
  await assert.rejects(
    establishOAuthSession({ error: new Error("provider failed") }, never),
    /provider failed/,
  );
  await assert.rejects(establishOAuthSession({}, never), /não retornou/);
});
test("a resolved Supabase error cannot be reported as a successful login", async () => {
  await assert.rejects(
    establishOAuthSession(
      { tokens: { access_token: "fake", refresh_token: "fake" } },
      async () => ({
        data: { session: null },
        error: new Error("invalid token"),
      }),
    ),
    /invalid token/,
  );
});
test("successful login requires a persisted session", async () => {
  const tokens = { access_token: "fake", refresh_token: "fake" };
  await assert.rejects(
    establishOAuthSession({ tokens }, async () => ({ data: { session: null }, error: null })),
    /confirmar/,
  );
  await establishOAuthSession({ tokens }, async (received) => {
    assert.deepEqual(received, tokens);
    return { data: { session: { user: { id: "test" } } }, error: null };
  });
});
