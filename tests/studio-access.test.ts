import { test } from "node:test";
import assert from "node:assert/strict";
import { withStudioAccess, StudioAccessError, confirmThenRefresh } from "../src/lib/studio-access.ts";

const ready = { checked: true, backendConfigured: true, neuralakeConfigured: true };
test("unconfigured and signed-out builders never invoke generation or publication", async () => {
  for (const operation of ["draft", "publish"] as const) {
    for (const [readiness, user, reason] of [
      [{ ...ready, checked: false }, "user", "checking"],
      [{ ...ready, backendConfigured: false }, "user", "server"],
      [ready, null, "login"],
    ] as const) {
      let calls = 0;
      await assert.rejects(withStudioAccess(operation, readiness, user, async () => ++calls),
        (error) => error instanceof StudioAccessError && error.reason === reason);
      assert.equal(calls, 0);
    }
  }
});
test("missing AI cannot produce a fake draft but manual publication stays available", async () => {
  const readiness = { ...ready, neuralakeConfigured: false };
  let calls = 0;
  await assert.rejects(withStudioAccess("draft", readiness, "user", async () => ++calls),
    (error) => error instanceof StudioAccessError && error.reason === "neuralake");
  assert.equal(calls, 0);
  assert.equal(await withStudioAccess("publish", readiness, "user", async () => ++calls), 1);
});
test("generation returns the actual provider result and propagates provider failure", async () => {
  const actual = { name: "Empresa gerada" };
  assert.equal(await withStudioAccess("draft", ready, "user", async () => actual), actual);
  await assert.rejects(withStudioAccess("draft", ready, "user", async () => { throw new Error("provider offline"); }), /provider offline/);
});
test("a failed refresh after commit still reports a published company without a second write", async () => {
  let writes = 0;
  const result = await confirmThenRefresh(async () => { writes++; return { companyId: "saved" }; },
    async () => { throw new Error("network offline"); });
  assert.deepEqual(result, { result: { companyId: "saved" }, refreshFailed: true });
  assert.equal(writes, 1);
});
test("a rejected publication is never confirmed and never refreshes", async () => {
  let reads = 0;
  await assert.rejects(confirmThenRefresh(async () => { throw new Error("write rejected"); }, async () => ++reads), /write rejected/);
  assert.equal(reads, 0);
});
