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
function order(c = company(), overrides = {}) {
  const version = sql(
    "SELECT v.id FROM offer_versions v JOIN offers f ON f.id=v.offer_id WHERE f.company_id='00000000-0000-0000-0000-000000001001';",
  );
  const payload = {
    buyerCompanyId: c.companyId,
    offerVersionId: version,
    title: "Preparar catálogo",
    budget: 30,
    rows: SAMPLE_ROWS,
    requestId: randomUUID(),
    testFailure: true,
    autoCorrect: false,
    humanReview: false,
    ...overrides,
  };
  return { ...c, payload, ...call(`studio_place_order('${c.user}',${j(payload)})`) };
}
const claim = (o) => call(`studio_claim_execution('${o.user}','${o.orderId}')`);
const balance = (o) =>
  sql(
    `SELECT available_units||','||reserved_units||','||paid_units FROM accounts WHERE company_id='${o.companyId}'`,
  );
function record(o, lease, bad = false) {
  const file = createCatalogueCsv(SAMPLE_ROWS, bad);
  return {
    file,
    ...call(
      `studio_record_delivery('${o.orderId}','${lease.token}',${q(file)},${j(verifyCatalogue(SAMPLE_ROWS, file))})`,
    ),
  };
}

test("company publication is atomic and idempotent, and registers a real offer", () => {
  const c = company();
  const repeated = company(c.user, c.request);
  assert.equal(repeated.companyId, c.companyId);
  assert.equal(balance(c), "100,0,0");
  const agents = JSON.parse(
    sql(
      `SELECT json_agg(a ORDER BY a.agent_type) FROM (SELECT agent_type,model,active FROM agents WHERE company_id='${c.companyId}') a`,
    ),
  );
  assert.deepEqual(agents, [
    { agent_type: "buyer", model: "reasoning", active: true },
    { agent_type: "supplier", model: "deterministic", active: true },
  ]);
  assert.equal(
    sql(`SELECT count(*) FROM offers WHERE company_id='${c.companyId}' AND published`),
    "1",
  );
  assert.throws(
    () => company(c.user, c.request, { ...STARTER_DRAFT, price: 99 }),
    /idempotency_conflict/,
  );
});
test("failed delivery blocks payment; corrected real file settles exactly once", () => {
  const o = order();
  assert.equal(balance(o), "88,12,0");
  assert.equal(call(`studio_place_order('${o.user}',${j(o.payload)})`).orderId, o.orderId);
  const lease = claim(o);
  assert.equal(claim(o).status, "in_progress");
  const failed = record(o, lease, true);
  assert.equal(failed.decision, "rejected");
  assert.throws(() => call(`settle_verified_order('${o.orderId}','attempt-1')`));
  assert.equal(balance(o), "88,12,0");
  const good = record(o, claim(o));
  assert.equal(good.sha256, createHash("sha256").update(good.file).digest("hex"));
  assert.equal(
    sql(`SELECT artifact_content FROM deliveries WHERE id='${good.deliveryId}'`),
    good.file.trim(),
  );
  call(`settle_verified_order('${o.orderId}','attempt-2')`);
  call(`settle_verified_order('${o.orderId}','another-caller-key')`);
  assert.equal(balance(o), "88,0,12");
  assert.equal(
    sql(
      `SELECT count(*) FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type='payment'`,
    ),
    "1",
  );
  assert.equal(claim(o).status, "settled");
});
test("cancellation refunds once and invalidates a worker already running", () => {
  const o = order();
  const lease = claim(o);
  call(`studio_cancel_order('${o.user}','${o.orderId}')`);
  call(`studio_cancel_order('${o.user}','${o.orderId}')`);
  assert.equal(balance(o), "100,0,0");
  assert.throws(() => record(o, lease), /stale_execution/);
});
test("another user cannot buy, run, cancel or annotate this order", () => {
  const o = order();
  const outsider = randomUUID();
  assert.throws(
    () => call(`studio_place_order('${outsider}',${j({ ...o.payload, requestId: randomUUID() })})`),
    /buyer_access_denied/,
  );
  for (const name of ["studio_claim_execution", "studio_cancel_order"])
    assert.throws(() => call(`${name}('${outsider}','${o.orderId}')`), /order_access_denied/);
  assert.throws(
    () => call(`studio_add_clarification('${outsider}','${o.orderId}',0,'Observação')`),
    /order_access_denied/,
  );
});
test("new supplier can be contracted without a fixed company ID", () => {
  const supplier = company();
  const version = sql(
    `SELECT v.id FROM offer_versions v JOIN offers f ON f.id=v.offer_id WHERE f.company_id='${supplier.companyId}'`,
  );
  const o = order(company(), { offerVersionId: version });
  assert.equal(balance(o), "85,15,0");
  record(o, claim(o));
  call(`settle_verified_order('${o.orderId}','new-supplier')`);
  assert.equal(
    sql(`SELECT received_units FROM accounts WHERE company_id='${supplier.companyId}'`),
    "14",
  );
});
test("expired lease cannot record over its replacement and stale clarification is rejected", () => {
  const o = order();
  const old = claim(o);
  sql(`UPDATE jobs SET lease_until=now()-interval '1 second' WHERE order_id='${o.orderId}'`);
  const current = claim(o);
  assert.notEqual(current.token, old.token);
  assert.throws(() => record(o, old), /stale_execution/);
  record(o, current, true);
  assert.throws(
    () => call(`studio_add_clarification('${o.user}','${o.orderId}',0,'Observação')`),
    /stale_or_closed_review/,
  );
  call(`studio_add_clarification('${o.user}','${o.orderId}',1,'Preserve o preço original.')`);
  assert.equal(balance(o), "88,12,0");
});
test("unaffordable or self-contracting requests create no reservation", () => {
  const c = company();
  assert.throws(() => order(c, { budget: 1 }));
  assert.equal(balance(c), "100,0,0");
  const version = sql(
    `SELECT v.id FROM offer_versions v JOIN offers f ON f.id=v.offer_id WHERE f.company_id='${c.companyId}'`,
  );
  assert.throws(() => order(c, { offerVersionId: version }), /offer_unavailable/);
  assert.equal(balance(c), "100,0,0");
});
test("anonymous clients cannot invoke financial studio operations or read agent secrets", () => {
  const c = company();
  assert.throws(
    () =>
      sql(
        `SET ROLE anon; SELECT studio_create_company('${c.user}','${randomUUID()}',${j(STARTER_DRAFT)})`,
      ),
    /permission denied/,
  );
  assert.throws(() => sql("SET ROLE anon; SELECT * FROM agent_credentials"), /permission denied/);
  sql("GRANT SELECT ON companies,offers,capabilities,offer_versions TO anon");
  assert.equal(sql(`SET ROLE anon; SELECT count(*) FROM companies WHERE id='${c.companyId}'`), "1");
});

test("retry keeps the original order even when an AI would select another supplier", () => {
  const c = company();
  const hash = "a".repeat(64);
  const o = order(c, { requestHash: hash });
  const other = sql(
    "SELECT v.id FROM offer_versions v JOIN offers f ON f.id=v.offer_id WHERE f.company_id='00000000-0000-0000-0000-000000001002'",
  );
  const again = call(
    `studio_place_order('${c.user}',${j({ ...o.payload, offerVersionId: other, selectionReason: "Other selection" })})`,
  );
  assert.equal(again.orderId, o.orderId);
  assert.equal(balance(o), "88,12,0");
});

test("a concurrent cancellation and settlement cannot refund and pay the same reservation", async () => {
  const o = order();
  record(o, claim(o));
  const concurrentSql = (statement) =>
    new Promise((resolve, reject) => {
      const process = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
      let output = "",
        error = "";
      process.stdout.on("data", (v) => (output += v));
      process.stderr.on("data", (v) => (error += v));
      process.on("error", reject);
      process.on("close", (code) => (code === 0 ? resolve(output) : reject(new Error(error))));
      process.stdin.end(statement);
    });
  const results = await Promise.allSettled([
    concurrentSql(`SELECT studio_cancel_order('${o.user}','${o.orderId}');`),
    concurrentSql(`SELECT settle_verified_order('${o.orderId}','racing-call');`),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const status = sql(`SELECT status FROM orders WHERE id='${o.orderId}'`);
  assert.equal(balance(o), status === "settled" ? "88,0,12" : "100,0,0");
  assert.equal(
    sql(
      `SELECT count(*) FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type IN ('payment','refund')`,
    ),
    "1",
  );
});

test("unpublished offers and internal capabilities are private to their company", () => {
  const c = company(),
    outsider = randomUUID();
  sql(`UPDATE offers SET published=false WHERE company_id='${c.companyId}';
    GRANT SELECT ON companies,company_members,offers,capabilities,offer_versions TO authenticated;`);
  const read = (actor, table, where) =>
    sql(
      `SET test.user_id='${actor}'; SET ROLE authenticated; SELECT count(*) FROM ${table} WHERE ${where};`,
    );
  const vid = sql(`SELECT id FROM offer_versions WHERE offer_id='${c.offerId}'`);
  assert.equal(read(outsider, "offer_versions", `id='${vid}'`), "0");
  assert.equal(read(outsider, "capabilities", `company_id='${c.companyId}'`), "0");
  assert.equal(read(c.user, "offer_versions", `id='${vid}'`), "1");
  assert.equal(read(c.user, "capabilities", `company_id='${c.companyId}'`), "1");
  sql(`UPDATE offers SET published=true WHERE company_id='${c.companyId}'`);
  assert.equal(read(outsider, "offer_versions", `id='${vid}'`), "1");
  assert.equal(read(outsider, "capabilities", `company_id='${c.companyId}'`), "1");
});

test("human contract keeps credits reserved after objective approval and pays only once after signed owner review", () => {
  const o = order(company(), { humanReview: true, testFailure: false });
  const delivery = record(o, claim(o));
  const reportId = sql(
    `SELECT id FROM verification_reports WHERE delivery_id='${delivery.deliveryId}'`,
  );
  assert.throws(
    () => call(`settle_verified_order('${o.orderId}','bypass')`),
    /human_approval_required/,
  );
  assert.equal(balance(o), "88,12,0");
  const review = (actor = o.user, sha = delivery.sha256) =>
    call(
      `studio_review_delivery('${actor}','${o.orderId}','${delivery.deliveryId}','${reportId}','${sha}','approved','Conferi o arquivo e os preços.')`,
    );
  assert.throws(() => review(randomUUID()), /review_access_denied/);
  assert.throws(() => review(o.user, "0".repeat(64)), /stale_review/);
  review();
  review();
  assert.equal(balance(o), "88,0,12");
  assert.equal(sql(`SELECT count(*) FROM human_reviews WHERE order_id='${o.orderId}'`), "1");
});
test("human cannot override a failed objective check or reuse an earlier version approval", () => {
  const o = order(company(), { humanReview: true });
  const bad = record(o, claim(o), true);
  const r = sql(`SELECT id FROM verification_reports WHERE delivery_id='${bad.deliveryId}'`);
  assert.throws(
    () =>
      call(
        `studio_review_delivery('${o.user}','${o.orderId}','${bad.deliveryId}','${r}','${bad.sha256}','approved','Quero aprovar mesmo assim.')`,
      ),
    /objective_checks_required/,
  );
  record(o, claim(o));
  assert.throws(
    () =>
      call(
        `studio_review_delivery('${o.user}','${o.orderId}','${bad.deliveryId}','${r}','${bad.sha256}','approved','Entrega antiga.')`,
      ),
    /stale_review/,
  );
  assert.equal(balance(o), "88,12,0");
});
test("human rejection allows a new version and cancellation preserves funds", () => {
  const o = order(company(), { humanReview: true, testFailure: false });
  const d = record(o, claim(o));
  const r = sql(`SELECT id FROM verification_reports WHERE delivery_id='${d.deliveryId}'`);
  call(
    `studio_review_delivery('${o.user}','${o.orderId}','${d.deliveryId}','${r}','${d.sha256}','rejected','Preciso revisar a origem antes do aceite.')`,
  );
  assert.equal(sql(`SELECT status FROM orders WHERE id='${o.orderId}'`), "revision_requested");
  call(`studio_cancel_order('${o.user}','${o.orderId}')`);
  assert.equal(balance(o), "100,0,0");
  assert.throws(() =>
    call(
      `studio_review_delivery('${o.user}','${o.orderId}','${d.deliveryId}','${r}','${d.sha256}','approved','Mudança depois do cancelamento.')`,
    ),
  );
});
test("private capability stays hidden until its owner tests and explicitly commercializes it", () => {
  const c = company(randomUUID(), randomUUID(), { ...STARTER_DRAFT, visibility: "private" });
  assert.equal(sql(`SELECT published FROM offers WHERE id='${c.offerId}'`), "f");
  assert.equal(sql(`SET ROLE anon;SELECT count(*) FROM offers WHERE id='${c.offerId}'`), "0");
  assert.throws(
    () => call(`studio_set_commercial('${randomUUID()}','${c.companyId}',true)`),
    /company_access_denied/,
  );
  assert.throws(
    () => call(`studio_set_commercial('${c.user}','${c.companyId}',true)`),
    /successful_private_run_required/,
  );
  sql(
    `INSERT INTO private_runs(company_id,requested_by,request_id,input_hash,artifact_content,sha256,report,duration_ms) VALUES('${c.companyId}','${c.user}','${randomUUID()}','input','private-data','hash','{"decision":"approved"}',1)`,
  );
  call(`studio_set_commercial('${c.user}','${c.companyId}',true)`);
  assert.equal(sql(`SET ROLE anon;SELECT count(*) FROM offers WHERE id='${c.offerId}'`), "1");
  const outsider = randomUUID();
  assert.equal(
    sql(
      `SET ROLE authenticated;SET test.user_id='${outsider}';SELECT count(*) FROM private_runs WHERE company_id='${c.companyId}'`,
    ),
    "0",
  );
  call(`studio_set_commercial('${c.user}','${c.companyId}',false)`);
  assert.equal(sql(`SET ROLE anon;SELECT count(*) FROM offers WHERE id='${c.offerId}'`), "0");
});

test("human review policy and recorded approvals are immutable", () => {
  const o = order(company(), { humanReview: true, testFailure: false });
  assert.throws(
    () => sql(`UPDATE contracts SET requires_human_review=false WHERE order_id='${o.orderId}'`),
    /immutable/,
  );
  const d = record(o, claim(o)),
    r = sql(`SELECT id FROM verification_reports WHERE delivery_id='${d.deliveryId}'`);
  call(
    `studio_review_delivery('${o.user}','${o.orderId}','${d.deliveryId}','${r}','${d.sha256}','approved','Conferi os preços e o arquivo.')`,
  );
  assert.throws(
    () => sql(`UPDATE human_reviews SET decision='rejected' WHERE order_id='${o.orderId}'`),
    /immutable/,
  );
});
test("human approval racing cancellation moves the reservation exactly once", async () => {
  const o = order(company(), { humanReview: true, testFailure: false }),
    d = record(o, claim(o));
  const r = sql(`SELECT id FROM verification_reports WHERE delivery_id='${d.deliveryId}'`);
  const concurrent = (statement) =>
    new Promise((resolve, reject) => {
      const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
      let error = "";
      child.stderr.on("data", (v) => (error += v));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(error))));
      child.stdin.end(statement);
    });
  const result = await Promise.allSettled([
    concurrent(
      `SELECT studio_review_delivery('${o.user}','${o.orderId}','${d.deliveryId}','${r}','${d.sha256}','approved','Conferi a entrega atual.');`,
    ),
    concurrent(`SELECT studio_cancel_order('${o.user}','${o.orderId}');`),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    sql(
      `SELECT count(*) FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type IN ('payment','refund')`,
    ),
    "1",
  );
  const status = sql(`SELECT status FROM orders WHERE id='${o.orderId}'`);
  assert.equal(balance(o), status === "settled" ? "88,0,12" : "100,0,0");
});

// Lovable may record an already applied SQL body under a new migration number.
test("reapplying the deployment migration preserves private visibility, contracts and funds", () => {
  const c = company(randomUUID(), randomUUID(), { ...STARTER_DRAFT, visibility: "private" });
  const o = order(c, { humanReview: true, testFailure: false });
  sql(
    readFileSync(
      new URL("../drizzle/migrations/0008_complete_agent_chain.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(balance(o), "88,12,0");
  assert.equal(sql(`SELECT visibility FROM companies WHERE id='${c.companyId}'`), "private");
  assert.equal(
    sql(`SELECT requires_human_review FROM contracts WHERE order_id='${o.orderId}'`),
    "t",
  );
});

function specialist() {
  const user = randomUUID(),
    trial = randomUUID(),
    hash = "f".repeat(64);
  const config = {
    name: "Agente de propostas",
    description: "Prepara propostas comerciais com os dados fornecidos.",
    serviceTitle: "Proposta comercial",
    category: "Vendas",
    capability: "agent.task.v1",
    instructions: "Escreva propostas completas, com premissas explícitas e linguagem simples.",
    knowledge: "Referência privada do fornecedor",
    sections: ["Briefing, objetivo", 'Entrega "combinada"'],
    exampleTask: "Faça uma proposta comercial para uma loja",
    model: "reasoning",
    price: 15,
    visibility: "commercial",
  };
  sql(
    `INSERT INTO agent_trials(id,user_id,definition_hash,task,artifact_content,report,sha256,duration_ms) VALUES('${trial}','${user}','${hash}','Teste de proposta','{}','{"decision":"approved"}','${hash}',100);`,
  );
  const result = call(
    `studio_create_specialist('${user}','${randomUUID()}',${j(config)},'${hash}','${trial}')`,
  );
  return { user, trial, hash, config, ...result };
}
function specialistOrder(s = specialist()) {
  const buyer = company(),
    version = sql(`SELECT id FROM offer_versions WHERE offer_id='${s.offerId}'`);
  const payload = {
    buyerCompanyId: buyer.companyId,
    offerVersionId: version,
    requestId: randomUUID(),
    title: "Proposta para a loja",
    task: "Prepare uma proposta de marketing por 2000 reais por mês.",
    budget: 30,
    humanReview: false,
  };
  return {
    ...buyer,
    ...call(`studio_place_agent_order('${buyer.user}',${j(payload)})`),
    payload,
    s,
  };
}
test("specialist publishing requires the caller's successful test of the current execution definition", () => {
  const s = specialist();
  assert.throws(
    () =>
      call(
        `studio_create_specialist('${randomUUID()}','${randomUUID()}',${j(s.config)},'${s.hash}','${s.trial}')`,
      ),
    /successful_current_agent_trial_required/,
  );
  assert.throws(
    () =>
      call(
        `studio_create_specialist('${s.user}','${randomUUID()}',${j(s.config)},'changed','${s.trial}')`,
      ),
    /successful_current_agent_trial_required/,
  );
  assert.throws(
    () =>
      sql(
        `SET ROLE authenticated; SELECT definition FROM agent_definitions WHERE company_id='${s.companyId}'`,
      ),
    /permission denied/,
  );
  assert.throws(
    () => sql(`SET ROLE anon; SELECT artifact_content FROM agent_trials`),
    /permission denied/,
  );
  assert.throws(
    () => sql(`UPDATE agent_definitions SET definition='{}' WHERE company_id='${s.companyId}'`),
    /immutable/,
  );
  const publicData = sql(
    `SET ROLE anon; SELECT output_format::text FROM offer_versions WHERE offer_id='${s.offerId}'`,
  );
  assert.ok(!publicData.includes(s.config.knowledge));
  assert.ok(!publicData.includes(s.config.instructions));
});
test("generic specialist contract preserves exact section names, requires human review and settles once", async () => {
  const { verifyAgentResult, agentCriteria } = await import("../src/lib/agent-definition.ts");
  const o = specialistOrder();
  assert.deepEqual(
    call(`agent_acceptance_criteria(${j(o.s.config.sections)})`),
    agentCriteria(o.s.config.sections),
  );
  const c = claim(o);
  assert.equal(c.input.capability, "agent.task.v1");
  assert.equal(c.input.humanReview, true);
  assert.ok(c.input.definitionId);
  const content = JSON.stringify({
    title: "Proposta comercial",
    sections: o.s.config.sections.map((heading) => ({
      heading,
      content: "Esta é a proposta baseada nas informações fornecidas.",
    })),
    artifacts: [],
  });
  const report = verifyAgentResult(o.s.config.sections, content);
  const d = call(
    `studio_record_agent_delivery('${o.orderId}','${c.token}',${q(content)},${j(report)})`,
  );
  assert.equal(balance(o), "85,15,0");
  assert.throws(
    () => call(`settle_verified_order('${o.orderId}','bypass')`),
    /human_approval_required/,
  );
  const rid = sql(`SELECT id FROM verification_reports WHERE delivery_id='${d.deliveryId}'`);
  for (let i = 0; i < 2; i++)
    call(
      `studio_review_delivery('${o.user}','${o.orderId}','${d.deliveryId}','${rid}','${d.sha256}','approved','Revisei o conteúdo da proposta.')`,
    );
  assert.equal(balance(o), "85,0,15");
  assert.equal(
    sql(
      `SELECT count(*) FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type='receipt'`,
    ),
    "1",
  );
  assert.equal(
    sql(`SELECT media_type FROM deliveries WHERE id='${d.deliveryId}'`),
    "application/json",
  );
});
test("provider failure releases its execution lease while funds stay reserved for retry or cancellation", () => {
  const o = specialistOrder(),
    c = claim(o);
  call(`studio_release_execution('${o.user}','${o.orderId}','${c.token}')`);
  assert.equal(balance(o), "85,15,0");
  assert.equal(sql(`SELECT status FROM orders WHERE id='${o.orderId}'`), "contracted");
  const retry = claim(o);
  assert.notEqual(retry.token, c.token);
  assert.throws(
    () =>
      call(
        `studio_record_agent_delivery('${o.orderId}','${c.token}','{}','{"decision":"approved","checks":[]}'::jsonb)`,
      ),
    /stale_execution/,
  );
  call(`studio_cancel_order('${o.user}','${o.orderId}')`);
  assert.equal(balance(o), "100,0,0");
  assert.throws(
    () =>
      call(
        `studio_record_agent_delivery('${o.orderId}','${retry.token}','{}','{"decision":"approved","checks":[]}'::jsonb)`,
      ),
    /stale_execution/,
  );
});
test("specialist RPCs are server-only and orders cannot exceed a budget or buy their own service", () => {
  const o = specialistOrder();
  assert.throws(
    () =>
      sql(
        `SET ROLE authenticated; SELECT studio_place_agent_order('${o.user}',${j({ ...o.payload, requestId: randomUUID() })})`,
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      call(
        `studio_place_agent_order('${o.user}',${j({ ...o.payload, budget: 1, requestId: randomUUID() })})`,
      ),
    /invalid_contract_price/,
  );
  assert.throws(
    () =>
      call(
        `studio_place_agent_order('${o.s.user}',${j({ ...o.payload, buyerCompanyId: o.s.companyId, requestId: randomUUID() })})`,
      ),
    /offer_unavailable/,
  );
});
