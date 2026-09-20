import { evaluateBrowserSuppliers } from "../src/lib/browser-market.ts";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import {
  SAMPLE_ROWS,
  STARTER_DRAFT,
  createCatalogueCsv,
  verifyCatalogue,
} from "../src/lib/a2a-contract.ts";

const temp = mkdtempSync("/private/tmp/neuramarket-studio-test-");
const cluster = `${temp}/data`,
  port = 56000 + Math.floor(Math.random() * 8000);
const args = [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-h",
  temp,
  "-p",
  String(port),
  "-U",
  "postgres",
  "-d",
  "postgres",
];
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
const sql = (statement) =>
  execFileSync("psql", args, {
    input: statement,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const call = (statement) => JSON.parse(sql(`SELECT ${statement};`));
let started = false;
before(() => {
  execFileSync(
    "initdb",
    ["-D", cluster, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8"],
    { stdio: "pipe" },
  );
  execFileSync(
    "pg_ctl",
    [
      "-D",
      cluster,
      "-l",
      `${temp}/postgres.log`,
      "-o",
      `-F -p ${port} -k ${temp} -c listen_addresses=''`,
      "-w",
      "start",
    ],
    { stdio: "pipe" },
  );
  started = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user_id',true),'')::uuid$$;
    CREATE TABLE storage.objects(bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT string_to_array($1,'/')$$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;`);
  for (const file of [
    "0000_create_neuramarket_core",
    "0001_add_financial_workflow_and_storage_policies",
    "0002_harden_verification_settlement",
    "0003_harden_verification_settlement",
    "0004_company_studio_and_a2a",
    "0005_apply_pending_company_studio",
    "0006_restrict_unpublished_catalogue",
    "0008_complete_agent_chain",
    "0010_neuralake_specialists",
    "0012_persist_autonomous_missions",
    "0013_browser_qa",
    "0015_private_financial_records",
    "0017_autonomous_browser_market",
    "0019_simulated_fx_market",
  ]) {
    sql(readFileSync(new URL(`../drizzle/migrations/${file}.sql`, import.meta.url), "utf8"));
  }
});
after(() => {
  if (started)
    execFileSync("pg_ctl", ["-D", cluster, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(temp, { recursive: true, force: true });
});
function company(
  user = randomUUID(),
  request = randomUUID(),
  config = { ...STARTER_DRAFT, visibility: "commercial" },
) {
  return { user, request, ...call(`studio_create_company('${user}','${request}',${j(config)})`) };
}

function quote(c, { request = randomUUID(), target = 100000, budget = 560000, minutes = 60 } = {}) {
  return call(`fx_quote('${c.user}','${c.companyId}','${request}',${target},${budget},${minutes})`);
}
function hire(c, qid, { auth = true, fault = true, mode = "autonomous", supplier = null } = {}) {
  return sql(
    `SELECT fx_hire('${c.user}','${c.companyId}','${qid}',${auth},${fault},'${mode}',${supplier ? q(supplier) : "NULL"});`,
  );
}
function step(c, id, accept = false) {
  return sql(`SELECT fx_step('${c.user}','${c.companyId}','${id}',${accept});`);
}
function snapshot(c, id) {
  return call(`fx_snapshot('${c.user}','${c.companyId}',${id ? q(id) : "NULL"})`);
}
function complete(c, id) {
  for (let i = 0; i < 7; i++) {
    const status = step(c, id);
    if (status === "settled") return snapshot(c, id);
  }
  throw Error("not settled");
}
const cancel = (c, id) => sql(`SELECT fx_cancel('${c.user}','${c.companyId}','${id}');`);

test("quotes respect cost including fee, deadline, seller minimum, and repeat identity", () => {
  const c = company(),
    request = randomUUID(),
    a = quote(c, { request });
  assert.equal(a.data.selected.supplierId, "fx-b");
  assert.equal(a.data.selected.totalBrlCents, 550000);
  assert.equal(a.data.selected.proposedFeeBrlCents, 1000);
  assert.equal(a.data.selected.feeBrlCents, 1500);
  assert.equal(a.data.offers[0].eligible, false);
  assert.equal(quote(c, { request }).id, a.id);
  assert.throws(() => quote(c, { request, budget: 550000 }), /fx_idempotency_conflict/);
  assert.equal(quote(c, { minutes: 1440 }).data.selected.supplierId, "fx-a");
  assert.equal(quote(c, { budget: 549999 }).data.selected, null);
  assert.equal(quote(c, { minutes: 1 }).data.selected, null);
  assert.throws(() => quote(c, { target: 0 }), /fx_invalid_input/);
});
test("full autonomous FX rejects bad receipt, corrects document only, settles exactly once", () => {
  const c = company(),
    quoteResult = quote(c),
    id = hire(c, quoteResult.id);
  assert.equal(snapshot(c, id).wallet.reserved_brl, 550000);
  assert.equal(step(c, id), "delivered");
  const op = snapshot(c, id).operation.operation_id;
  assert.equal(step(c, id), "rejected");
  let d = snapshot(c, id);
  assert.equal(d.wallet.available_usd, 0);
  assert.equal(d.ledger, null);
  assert.equal(
    d.reports[0].checks.find((x) => x.criterion === "Valor líquido em USD").passed,
    false,
  );
  assert.equal(step(c, id), "corrected");
  assert.equal(snapshot(c, id).operation.operation_id, op);
  assert.equal(step(c, id), "approved");
  assert.equal(step(c, id), "settled");
  d = snapshot(c, id);
  assert.equal(d.wallet.available_brl, 450000);
  assert.equal(d.wallet.reserved_brl, 0);
  assert.equal(d.wallet.available_usd, 100000);
  assert.equal(d.wallet.spent_brl, 550000);
  assert.equal(d.ledger.principal_brl, 549500);
  assert.equal(d.ledger.platform_fee_brl, 500);
  assert.equal(d.receipts.length, 2);
  assert.equal(d.reports.length, 2);
  assert.equal(step(c, id), "settled");
  assert.equal(hire(c, quoteResult.id), id);
  assert.deepEqual(snapshot(c, id).wallet, d.wallet);
  assert.equal(sql(`SELECT count(*) FROM fx_ledger WHERE order_id='${id}'`), "1");
  assert.equal(
    sql(`SELECT available_units FROM accounts WHERE company_id='${c.companyId}'`),
    "100",
  );
});
test("no authorization, expired quote, wrong supplier, and unavailable offer cannot reserve", () => {
  const c = company(),
    qt = quote(c);
  assert.throws(() => hire(c, qt.id, { auth: false }), /fx_authorization_required/);
  assert.throws(() => hire(c, qt.id, { supplier: "fx-a" }), /fx_manual_selection_not_allowed/);
  assert.throws(() => hire(c, qt.id, { mode: "manual", supplier: "fx-a" }), /fx_no_eligible_offer/);
  sql(`UPDATE fx_quotes SET expires_at=now()-interval '1 second' WHERE id='${qt.id}'`);
  assert.throws(() => hire(c, qt.id), /fx_quote_expired/);
  assert.equal(snapshot(c).wallet.reserved_brl, 0);
});
test("tenants and database roles cannot read or alter other companies financial data", () => {
  const c = company(),
    other = company(),
    qt = quote(c),
    id = hire(c, qt.id);
  assert.throws(() => snapshot(other, id), /fx_order_not_found/);
  assert.throws(
    () => call(`fx_snapshot('${other.user}','${c.companyId}','${id}')`),
    /fx_access_denied/,
  );
  assert.throws(() => hire(other, qt.id), /fx_quote_not_found/);
  for (const table of [
    "fx_wallets",
    "fx_quotes",
    "fx_operations",
    "fx_receipts",
    "fx_reports",
    "fx_ledger",
    "fx_events",
  ]) {
    assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid='${table}'::regclass`), "t");
    assert.equal(sql(`SELECT has_table_privilege('authenticated','${table}','SELECT')`), "f");
  }
  assert.equal(
    sql(`SELECT has_function_privilege('anon','fx_step(uuid,uuid,uuid,boolean)','EXECUTE')`),
    "f",
  );
});
test("correction cannot repair a false simulator record and releases no money", () => {
  const c = company(),
    id = hire(c, quote(c).id);
  step(c, id);
  sql(`UPDATE fx_operations SET target_usd=99000 WHERE order_id='${id}'`);
  assert.equal(step(c, id), "rejected");
  step(c, id);
  assert.equal(step(c, id), "rejected");
  assert.equal(step(c, id), "rejected");
  const d = snapshot(c, id);
  assert.equal(d.wallet.available_usd, 0);
  assert.equal(d.ledger, null);
  assert.equal(d.receipts.length, 2);
  assert.equal(cancel(c, id), "cancelled");
  assert.equal(snapshot(c, id).wallet.available_brl, 1000000);
  assert.equal(cancel(c, id), "cancelled");
  assert.equal(snapshot(c, id).wallet.reserved_brl, 0);
});
test("settlement rechecks data after audit and blocks changed operation or forged receipt", () => {
  for (const mutation of [
    "UPDATE fx_operations SET company_id='%OTHER%'",
    "UPDATE fx_operations SET target_usd=1",
    'UPDATE fx_receipts SET body=body||\'{"targetCurrency":"EUR"}\'::jsonb',
  ]) {
    const c = company(),
      other = company(),
      id = hire(c, quote(c).id, { fault: false });
    step(c, id);
    step(c, id);
    sql(mutation.replace("%OTHER%", other.companyId) + ` WHERE order_id='${id}'`);
    assert.throws(() => step(c, id), /fx_verification_required/);
    assert.equal(snapshot(c, id).wallet.available_usd, 0);
  }
});
test("manual contracts stop for human acceptance and cannot change mode on retry", () => {
  const c = company(),
    qt = quote(c),
    id = hire(c, qt.id, { mode: "manual", supplier: "fx-b", fault: false });
  step(c, id);
  step(c, id);
  assert.equal(step(c, id), "awaiting_approval");
  assert.equal(step(c, id), "awaiting_approval");
  assert.equal(snapshot(c, id).wallet.available_usd, 0);
  assert.throws(() => hire(c, qt.id), /fx_idempotency_conflict/);
  assert.equal(step(c, id, true), "settled");
  assert.equal(snapshot(c, id).events.at(-1).detail.humanAccepted, true);
});
test("expired contracts refund once and cannot settle", () => {
  const c = company(),
    id = hire(c, quote(c).id);
  step(c, id);
  sql(`UPDATE fx_orders SET deadline_at=now()-interval '1 second' WHERE id='${id}'`);
  assert.equal(step(c, id), "deadline_expired");
  assert.equal(cancel(c, id), "expired");
  assert.equal(cancel(c, id), "expired");
  assert.equal(snapshot(c, id).wallet.available_brl, 1000000);
  assert.equal(snapshot(c, id).wallet.available_usd, 0);
});
test("insufficient balances cannot spend; settled orders cannot be cancelled", () => {
  const c = company(),
    id = hire(c, quote(c).id);
  complete(c, id);
  assert.throws(() => hire(c, quote(c).id), /fx_insufficient_balance/);
  assert.throws(() => cancel(c, id), /fx_already_settled/);
});
function concurrentSql(statement) {
  return new Promise((resolve, reject) => {
    const p = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "",
      error = "";
    p.stdout.on("data", (b) => (output += b));
    p.stderr.on("data", (b) => (error += b));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, output: output.trim(), error }));
    p.stdin.end(statement);
  });
}
test("concurrent hires reserve once and concurrent settlement pays once", async () => {
  const c = company(),
    qt = quote(c);
  const command = `SELECT fx_hire('${c.user}','${c.companyId}','${qt.id}',true,false);`;
  const hires = await Promise.all([concurrentSql(command), concurrentSql(command)]);
  assert.ok(hires.every((r) => r.code === 0));
  assert.equal(hires[0].output, hires[1].output);
  const id = hires[0].output;
  step(c, id);
  step(c, id);
  const settled = await Promise.all([
    concurrentSql(`SELECT fx_step('${c.user}','${c.companyId}','${id}');`),
    concurrentSql(`SELECT fx_step('${c.user}','${c.companyId}','${id}');`),
  ]);
  assert.ok(settled.every((r) => r.code === 0 && r.output === "settled"));
  assert.equal(snapshot(c, id).wallet.available_usd, 100000);
  assert.equal(snapshot(c, id).wallet.spent_brl, 550000);
});
