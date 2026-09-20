import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { evaluateBrowserSuppliers, autonomousBrowserSchema } from "../src/lib/browser-market.ts";
const suppliers = [
  {
    id: "a",
    name: "Desktop",
    listPrice: 5,
    minimumPrice: 4,
    desktop: true,
    mobile: false,
    form: false,
    estimatedMs: 5000,
  },
  {
    id: "b",
    name: "Completo",
    listPrice: 15,
    minimumPrice: 13,
    desktop: true,
    mobile: true,
    form: true,
    estimatedMs: 20000,
  },
];
test("scope changes the winning supplier and negotiation respects seller minimum and buyer ceiling", () => {
  const full = evaluateBrowserSuppliers(
    suppliers,
    { supported: true, viewports: ["desktop", "mobile"], form: true, reason: "Formulário" },
    20,
  );
  assert.equal(full.selectedOffer, "b");
  assert.equal(full.offers[1].proposal, 12);
  assert.equal(full.offers[1].price, 13);
  const desktop = evaluateBrowserSuppliers(
    suppliers,
    { supported: true, viewports: ["desktop"], form: false, reason: "Captura" },
    5,
  );
  assert.equal(desktop.selectedOffer, "a");
  assert.equal(desktop.offers[0].price, 4);
  assert.equal(
    evaluateBrowserSuppliers(
      suppliers,
      { supported: true, viewports: ["desktop", "mobile"], form: true, reason: "Formulário" },
      12,
    ).selectedOffer,
    null,
  );
  assert.equal(
    evaluateBrowserSuppliers(
      suppliers,
      { supported: false, viewports: ["desktop"], form: false, reason: "Outro site" },
      20,
    ).selectedOffer,
    null,
  );
});
test("autonomous requests cannot silently opt into payment", () => {
  const req = {
    requestId: randomUUID(),
    objective: "Testar o formulário de demonstração",
    budget: 20,
  };
  assert.equal(autonomousBrowserSchema.safeParse(req).success, false);
  assert.equal(
    autonomousBrowserSchema.safeParse({ ...req, authorizeAutomaticPayment: false }).success,
    false,
  );
  assert.equal(
    autonomousBrowserSchema.safeParse({ ...req, authorizeAutomaticPayment: true }).success,
    true,
  );
});
