import test from "node:test";
import assert from "node:assert/strict";
import { compareEconomics } from "../src/lib/economics.ts";
const assumptions = {
  uses: 1,
  setupCredits: 20,
  ownRunCredits: 2,
  setupMinutes: 15,
  ownRunMinutes: 1,
  hasOwnAgent: false,
};
const offers = [{ id: "specialist", price: 12, deadlineHours: 1 }];
test("one use favors hiring while repetition amortizes setup", () => {
  assert.equal(compareEconomics(assumptions, offers).recommended, "hire");
  const recurring = compareEconomics({ ...assumptions, uses: 5 }, offers);
  assert.equal(recurring.recommended, "create");
  assert.equal(recurring.ownTotal, 30);
  assert.equal(recurring.hireTotal, 60);
  assert.equal(recurring.breakEvenUses, 2);
});
test("existing agents exclude sunk setup costs and no offers cannot recommend hiring", () => {
  assert.equal(compareEconomics({ ...assumptions, hasOwnAgent: true }, offers).ownTotal, 2);
  assert.equal(compareEconomics(assumptions, []).recommended, "create");
  assert.equal(compareEconomics({ ...assumptions, ownRunCredits: 14 }, offers).breakEvenUses, null);
});
test("invalid financial assumptions are rejected", () => {
  for (const patch of [{ uses: 0 }, { setupCredits: -1 }, { ownRunCredits: NaN }])
    assert.throws(() => compareEconomics({ ...assumptions, ...patch }, offers));
});
