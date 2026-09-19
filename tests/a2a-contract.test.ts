import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY,
  CATALOGUE_CRITERIA,
  SAMPLE_ROWS,
  createCatalogueCsv,
  parseCatalogueCsv,
  verifyCatalogue,
  selectAffordableOffer,
} from "../src/lib/a2a-contract.ts";
import type { AgentOffer } from "../src/lib/a2a-contract.ts";

test("generated CSV preserves quotes, commas, line breaks and all prices", () => {
  const rows = [...SAMPLE_ROWS, { sku: 'Item,"especial"\n2', size: "Único", priceCents: 0 }];
  const file = createCatalogueCsv(rows);
  assert.equal(parseCatalogueCsv(file).length, rows.length);
  assert.equal(verifyCatalogue(rows, file).decision, "approved");
  assert.equal(verifyCatalogue(rows, file).checks.length, 4);
});
test("one cent changed fails independently of the supplier", () => {
  const report = verifyCatalogue(SAMPLE_ROWS, createCatalogueCsv(SAMPLE_ROWS, true));
  assert.equal(report.decision, "rejected");
  assert.equal(report.checks[2].status, "failed");
  assert.equal(report.checks[1].status, "passed");
});
test("missing, duplicated or renamed products cannot pass verification", () => {
  for (const rows of [
    SAMPLE_ROWS.slice(1),
    [...SAMPLE_ROWS, SAMPLE_ROWS[0]],
    SAMPLE_ROWS.map((r, i) => (i ? r : { ...r, sku: "alterado" })),
  ]) {
    assert.equal(verifyCatalogue(SAMPLE_ROWS, createCatalogueCsv(rows)).decision, "rejected");
  }
  const duplicates = [...SAMPLE_ROWS, SAMPLE_ROWS[0]];
  assert.equal(verifyCatalogue(duplicates, createCatalogueCsv(duplicates)).decision, "rejected");
});
test("malformed CSV, fractional/negative prices and oversized input are rejected", () => {
  for (const file of [
    "sku,size,priceCents\na,b,-1",
    "sku,size,priceCents\na,b,1.5",
    'sku,size,priceCents\n"open,b,1',
    'sku,size,priceCents\n"a"x,b,1',
    "sku,size,priceCents\na,b,1,extra",
    "wrong\na,b,1",
    "x".repeat(128001),
  ]) {
    assert.throws(() => parseCatalogueCsv(file));
    assert.equal(verifyCatalogue(SAMPLE_ROWS, file).decision, "rejected");
  }
});
test("buyer discovers a new supplier, respects budget and never hires itself", () => {
  const offer = (id: string, companyId: string, price: number): AgentOffer => ({
    id,
    companyId,
    price,
    offerId: id,
    companyName: id,
    title: id,
    description: id,
    deadlineHours: 1,
    capability: CAPABILITY,
    criteria: CATALOGUE_CRITERIA,
  });
  const offers = [
    offer("own", "buyer", 1),
    offer("known", "supplier", 12),
    offer("new", "new-company", 8),
  ];
  assert.equal(selectAffordableOffer(offers, "buyer", 10).id, "new");
  assert.throws(() => selectAffordableOffer(offers, "buyer", 7));
  assert.throws(() => selectAffordableOffer(offers, "buyer", 20, "own"));
  assert.throws(() => selectAffordableOffer(offers, "buyer", 10, "known"));
});

test("CSV exports reject cells that could be interpreted as spreadsheet formulas", () => {
  for (const sku of ["=1+1", "+cmd", "@SUM(1)", "-cmd"])
    assert.throws(() => createCatalogueCsv([{ sku, size: "M", priceCents: 1 }]));
});
