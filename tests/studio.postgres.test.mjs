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
function preparedSpecialist(user, name, price = 15) {
  const trial = randomUUID(),
    hash = createHash("sha256").update(`${user}:${name}:${trial}`).digest("hex"),
    config = {
      name,
      description: "Especialista sob demanda preparado para uma missão autônoma.",
      serviceTitle: `Serviço ${name}`,
      category: "Conteúdo",
      capability: "agent.task.v1",
      instructions: "Produza a entrega solicitada com os dados do briefing e indique as premissas.",
      knowledge: "",
      sections: ["Análise do briefing", "Entrega final"],
      exampleTask: "Analise o briefing recebido e produza uma entrega estruturada.",
      model: "reasoning",
      price,
      visibility: "commercial",
    };
  sql(
    `INSERT INTO agent_trials(id,user_id,definition_hash,task,artifact_content,report,sha256,duration_ms)
      VALUES('${trial}','${user}','${hash}','Teste sob demanda','{}','{"decision":"approved"}','${hash}',100)`,
  );
  return { trial, hash, config };
}

function autonomousSpecialistPayload(buyer, requestId, requestHash) {
  return {
    buyerCompanyId: buyer.companyId,
    requestId,
    requestHash,
    title: "Etapa autônoma de conteúdo",
    task: "Produza uma entrega de conteúdo completa para a missão informada.",
    budget: 20,
    testFailure: false,
    autoCorrect: true,
    humanReview: true,
    selectionReason: "Especialista criado sob demanda.",
  };
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

test("on-demand publication and its first contract roll back together when funds are insufficient", async () => {
  const buyer = company();
  sql(`UPDATE accounts SET available_units=10 WHERE company_id='${buyer.companyId}'`);
  const before = {
    companies: sql(`SELECT count(*) FROM companies WHERE owner_user_id='${buyer.user}'`),
    offers: sql(
      `SELECT count(*) FROM offers WHERE company_id IN (SELECT id FROM companies WHERE owner_user_id='${buyer.user}')`,
    ),
    orders: sql(`SELECT count(*) FROM orders WHERE buyer_company_id='${buyer.companyId}'`),
    ledger: sql(
      `SELECT count(*) FROM ledger_entries WHERE company_id IN (SELECT id FROM companies WHERE owner_user_id='${buyer.user}')`,
    ),
  };
  const candidate = preparedSpecialist(buyer.user, "Agente sem saldo");
  const payload = autonomousSpecialistPayload(buyer, randomUUID(), "1".repeat(64));
  assert.throws(
    () =>
      call(
        `studio_create_and_place_specialist_order('${buyer.user}','${randomUUID()}',${j(candidate.config)},'${candidate.hash}','${candidate.trial}',${j(payload)})`,
      ),
    /insufficient_balance/,
  );
  assert.deepEqual(
    {
      companies: sql(`SELECT count(*) FROM companies WHERE owner_user_id='${buyer.user}'`),
      offers: sql(
        `SELECT count(*) FROM offers WHERE company_id IN (SELECT id FROM companies WHERE owner_user_id='${buyer.user}')`,
      ),
      orders: sql(`SELECT count(*) FROM orders WHERE buyer_company_id='${buyer.companyId}'`),
      ledger: sql(
        `SELECT count(*) FROM ledger_entries WHERE company_id IN (SELECT id FROM companies WHERE owner_user_id='${buyer.user}')`,
      ),
    },
    before,
  );

  sql(
    `UPDATE accounts SET available_units=20,reserved_units=0 WHERE company_id='${buyer.companyId}'`,
  );
  const candidates = [
    preparedSpecialist(buyer.user, "Agente concorrente A"),
    preparedSpecialist(buyer.user, "Agente concorrente B"),
  ];
  const calls = candidates.map((entry, index) => {
    const payload = autonomousSpecialistPayload(buyer, randomUUID(), String(index + 2).repeat(64));
    const statement = `SELECT studio_create_and_place_specialist_order('${buyer.user}','${randomUUID()}',${j(entry.config)},'${entry.hash}','${entry.trial}',${j(payload)});`;
    return new Promise((resolve, reject) => {
      const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
      let error = "";
      child.stderr.on("data", (value) => (error += value));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(error))));
      child.stdin.end(statement);
    });
  });
  const raced = await Promise.allSettled(calls);
  assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    sql(
      `SELECT count(*) FROM companies WHERE owner_user_id='${buyer.user}' AND kind='ai-specialist'`,
    ),
    "1",
  );
  assert.equal(sql(`SELECT count(*) FROM orders WHERE buyer_company_id='${buyer.companyId}'`), "1");
  assert.equal(balance(buyer), "5,15,0");
});

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

test("autonomous missions persist progress, reject conflicting retries and can resume an expired lease", () => {
  const c = company();
  const requestId = randomUUID();
  const inputHash = createHash("sha256").update("mission-input").digest("hex");
  const task = "Crie uma campanha completa com agentes especializados.";
  const claim = () =>
    call(
      `studio_claim_autonomous_mission('${c.user}','${c.companyId}','${requestId}','${inputHash}',${q(task)},80)`,
    );
  const first = claim();
  assert.equal(first.claimed, true);
  assert.equal(first.status, "planning");
  assert.ok(first.leaseUntil);
  assert.equal(
    sql(`SELECT lease_until>now() AND lease_until<now()+interval '130 seconds'
      FROM autonomous_missions WHERE id='${first.missionId}'`),
    "t",
  );
  const concurrent = claim();
  assert.equal(concurrent.claimed, false);
  assert.equal(concurrent.missionId, first.missionId);
  assert.equal(
    sql(
      `SELECT lease_token='${first.leaseToken}' FROM autonomous_missions WHERE id='${first.missionId}'`,
    ),
    "t",
  );
  sql(`INSERT INTO autonomous_mission_steps(mission_id,step_index,request_id,plan_step)
    VALUES('${first.missionId}',0,'${randomUUID()}','{"role":"Roteirista"}'::jsonb)`);
  assert.throws(
    () =>
      call(
        `studio_claim_autonomous_mission('${c.user}','${c.companyId}','${requestId}','${"b".repeat(64)}',${q(task)},80)`,
      ),
    /idempotency_conflict/,
  );
  sql(
    `UPDATE autonomous_missions SET lease_until=now()-interval '1 second',status='failed' WHERE id='${first.missionId}'`,
  );
  const resumed = claim();
  assert.equal(resumed.claimed, true);
  assert.notEqual(resumed.leaseToken, first.leaseToken);
  assert.ok(resumed.leaseUntil);
  sql(`UPDATE autonomous_missions SET status='completed',lease_token=NULL,lease_until=NULL
    WHERE id='${first.missionId}'`);
  assert.equal(claim().claimed, false);
  sql(
    readFileSync(
      new URL("../drizzle/migrations/0012_persist_autonomous_missions.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    sql(`SELECT status FROM autonomous_missions WHERE id='${first.missionId}'`),
    "completed",
  );
  assert.equal(
    sql(
      `SET test.user_id='${c.user}'; SET ROLE authenticated; SELECT count(*) FROM autonomous_missions WHERE id='${first.missionId}'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SET test.user_id='${c.user}'; SET ROLE authenticated; SELECT count(*) FROM autonomous_mission_steps WHERE mission_id='${first.missionId}'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SET test.user_id='${randomUUID()}'; SET ROLE authenticated; SELECT count(*) FROM autonomous_missions WHERE id='${first.missionId}'`,
    ),
    "0",
  );
});

test("incremental mission start is fast, idempotent and leaves execution unclaimed", () => {
  const c = company();
  const requestId = randomUUID();
  const inputHash = createHash("sha256").update("incremental-input").digest("hex");
  const task = "Planeje uma operação incremental com dois especialistas.";
  const start = () =>
    call(
      `studio_start_autonomous_mission('${c.user}','${c.companyId}','${requestId}','${inputHash}',${q(task)},5)`,
    );
  const first = start();
  assert.equal(first.created, true);
  assert.equal(first.status, "planning");
  assert.equal(
    sql(
      `SELECT lease_token IS NULL AND lease_until IS NULL FROM autonomous_missions WHERE id='${first.missionId}'`,
    ),
    "t",
  );
  const retry = start();
  assert.equal(retry.created, false);
  assert.equal(retry.missionId, first.missionId);
  assert.equal(sql(`SELECT count(*) FROM autonomous_missions WHERE id='${first.missionId}'`), "1");
  sql(`INSERT INTO autonomous_mission_steps(mission_id,step_index,request_id,plan_step,budget_cap) VALUES
    ('${first.missionId}',0,'${randomUUID()}','{}',3),
    ('${first.missionId}',1,'${randomUUID()}','{}',2)`);
  assert.equal(
    sql(
      `SELECT sum(budget_cap) FROM autonomous_mission_steps WHERE mission_id='${first.missionId}'`,
    ),
    "5",
  );
  assert.throws(
    () =>
      sql(`INSERT INTO autonomous_mission_steps(mission_id,step_index,request_id,plan_step,budget_cap)
        VALUES('${first.missionId}',2,'${randomUUID()}','{}',1)`),
    /mission_budget_exceeded/,
  );
  assert.throws(
    () =>
      call(
        `studio_start_autonomous_mission('${c.user}','${c.companyId}','${requestId}','${"c".repeat(64)}',${q(task)},5)`,
      ),
    /idempotency_conflict/,
  );
  assert.throws(
    () =>
      sql(
        `SET ROLE authenticated; SELECT studio_start_autonomous_mission('${c.user}','${c.companyId}','${randomUUID()}','${inputHash}',${q(task)},5)`,
      ),
    /permission denied/,
  );
});

test("an autonomous mission persists review pending and can resume after settlement", () => {
  const c = company();
  const requestId = randomUUID();
  const inputHash = createHash("sha256").update("review-pending-input").digest("hex");
  const task = "Produza e verifique uma cadeia de conteúdo antes de liquidar.";
  const mission = call(
    `studio_start_autonomous_mission('${c.user}','${c.companyId}','${requestId}','${inputHash}',${q(task)},30)`,
  );
  sql(`UPDATE autonomous_missions SET status='awaiting_review',plan='{}' WHERE id='${mission.missionId}';
    INSERT INTO autonomous_mission_steps(mission_id,step_index,request_id,plan_step,status,result)
    VALUES('${mission.missionId}',0,'${randomUUID()}','{}','awaiting_review','{}')`);
  assert.equal(
    sql(`SELECT status FROM autonomous_missions WHERE id='${mission.missionId}'`),
    "awaiting_review",
  );
  assert.equal(
    sql(`SELECT status FROM autonomous_mission_steps WHERE mission_id='${mission.missionId}'`),
    "awaiting_review",
  );
  const resumed = call(
    `studio_claim_autonomous_mission('${c.user}','${c.companyId}','${requestId}','${inputHash}',${q(task)},30)`,
  );
  assert.equal(resumed.claimed, true);
  assert.equal(resumed.status, "running");
  assert.throws(
    () => sql(`UPDATE autonomous_missions SET status='paid' WHERE id='${mission.missionId}'`),
    /autonomous_missions_status_check/,
  );
});

test("browser QA: reserve, reject incomplete, correct, human accept and pay exactly once", () => {
  const user = randomUUID();
  const cid = sql(`SELECT browser_buyer('${user}')`);
  assert.equal(sql(`SELECT browser_buyer('${user}')`), cid);
  const payload = {
    buyerCompanyId: cid,
    offerVersionId: "00000000-0000-0000-0000-000000002302",
    requestId: randomUUID(),
    title: "Testar formulário",
    task: "Testar desktop e mobile com evidências",
    budget: 20,
    fixture: "lead-form-v1",
    testFailure: true,
  };
  const purchase = () => call(`studio_place_browser_order('${user}',${j(payload)})`);
  const o = { user, companyId: cid, ...purchase() };
  assert.equal(purchase().orderId, o.orderId);
  assert.equal(balance(o), "85,15,0");
  assert.throws(
    () => call(`studio_place_browser_order('${user}',${j({ ...payload, budget: 14 })})`),
    /idempotency_conflict/,
  );
  assert.throws(
    () => call(`studio_place_browser_order('${randomUUID()}',${j(payload)})`),
    /buyer_access_denied/,
  );
  assert.throws(
    () =>
      call(
        `studio_place_browser_order('${user}',${j({ ...payload, requestId: randomUUID(), budget: 14 })})`,
      ),
    /invalid_contract_price/,
  );
  const checks = (pass) =>
    ["desktop", "mobile", "evidence_integrity"].map((criterion) => ({
      criterion,
      expected: true,
      observed: pass || criterion !== "mobile",
      status: pass || criterion !== "mobile" ? "passed" : "failed",
      evidence: "Teste executado",
    }));
  const lease = claim(o);
  call(
    `studio_record_browser_delivery('${o.orderId}','${lease.token}','{"realTest":1}',${j({ decision: "rejected", checks: checks(false), summary: "Falta mobile" })})`,
  );
  assert.equal(balance(o), "85,15,0");
  assert.throws(() => call(`settle_verified_order('${o.orderId}','any')`));
  const corrected = claim(o);
  const delivery = call(
    `studio_record_browser_delivery('${o.orderId}','${corrected.token}','{"realTest":2}',${j({ decision: "approved", checks: checks(true), summary: "Cobertura comprovada" })})`,
  );
  assert.throws(
    () => call(`settle_verified_order('${o.orderId}','any')`),
    /human_approval_required/,
  );
  const report = sql(
    `SELECT id FROM verification_reports WHERE delivery_id='${delivery.deliveryId}'`,
  );
  const accept = () =>
    call(
      `studio_review_delivery('${user}','${o.orderId}','${delivery.deliveryId}','${report}','${delivery.sha256}','approved','Conferi a cobertura dos testes.')`,
    );
  assert.equal(accept().status, "settled");
  accept();
  assert.equal(balance(o), "85,0,15");
  assert.equal(
    sql(
      `SELECT count(*) FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type='payment'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SELECT amount_units FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type='commission'`,
    ),
    "1",
  );
});

test("financial records require company membership, even for demo companies", () => {
  const c = company();
  sql(`UPDATE companies SET is_demo=true WHERE id='${c.companyId}'`);
  for (const table of ["accounts", "ledger_entries"]) {
    assert.throws(() => sql(`SET ROLE anon; SELECT * FROM ${table}`), /permission denied/);
    assert.equal(
      sql(
        `SET test.user_id='${randomUUID()}'; SET ROLE authenticated; SELECT count(*) FROM ${table} WHERE company_id='${c.companyId}'`,
      ),
      "0",
    );
    assert.equal(
      sql(
        `SET test.user_id='${c.user}'; SET ROLE authenticated; SELECT count(*) FROM ${table} WHERE company_id='${c.companyId}'`,
      ),
      "1",
    );
    assert.equal(
      sql(`SET ROLE service_role; SELECT count(*) FROM ${table} WHERE company_id='${c.companyId}'`),
      "1",
    );
  }
});

function autonomousFixture({
  scope = {
    supported: true,
    viewports: ["desktop", "mobile"],
    form: true,
    reason: "Testar formulário nos dois tamanhos",
  },
  budget = 20,
} = {}) {
  const user = randomUUID(),
    companyId = sql(`SELECT browser_buyer('${user}')`),
    requestId = randomUUID();
  const suppliers = call("browser_market_suppliers()");
  const evaluated = evaluateBrowserSuppliers(suppliers, scope, budget);
  const quoteId = sql(
    `INSERT INTO browser_mission_quotes(company_id,requested_by,request_id,input_hash,objective,budget,scope,quote,inference) VALUES('${companyId}','${user}','${requestId}','hash','Testar a página de demonstração',${budget},${j(scope)},${j(evaluated)},'{"requestedModel":"text","usage":{"total_tokens":20}}') RETURNING id`,
  );
  const place = (mode = "autonomous", authorized = true, offer = null) =>
    call(
      `studio_place_browser_mission('${user}','${companyId}','${quoteId}',${q(mode)},${offer ? q(offer) : "NULL"},${authorized},'mcp')`,
    );
  return { user, companyId, quoteId, requestId, place, evaluated, scope };
}
function browserRecord(o, decision = "approved", badCheck = false) {
  const lease = claim(o);
  const checks = [...o.scope.viewports, "evidence_integrity"].map((criterion) => ({
    criterion,
    expected: true,
    observed: !badCheck,
    status: badCheck ? "failed" : "passed",
    evidence: "Execução controlada",
  }));
  return call(
    `studio_record_browser_delivery('${o.orderId}','${lease.token}','{"test":true}',${j({ decision, checks, summary: "Relatório de teste" })})`,
  );
}
const advanceBrowser = (o) => call(`advance_browser_contract('${o.user}','${o.orderId}')`);
test("autonomous contract negotiates, corrects and settles once without human review", () => {
  const f = autonomousFixture(),
    o = { ...f, ...f.place() };
  assert.equal(o.price, 13);
  assert.equal(balance(o), "87,13,0");
  assert.equal(f.place().orderId, o.orderId);
  browserRecord(o, "rejected", true);
  assert.throws(() => call(`settle_verified_order('${o.orderId}','bad')`));
  assert.equal(advanceBrowser(o).status, "contracted");
  assert.equal(balance(o), "87,13,0");
  assert.equal(advanceBrowser(o).status, "contracted");
  browserRecord(o);
  assert.equal(advanceBrowser(o).status, "settled");
  assert.equal(advanceBrowser(o).status, "already_settled");
  assert.equal(balance(o), "87,0,13");
  assert.equal(sql(`SELECT count(*) FROM human_reviews WHERE order_id='${o.orderId}'`), "0");
  assert.equal(
    sql(
      `SELECT count(*) FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type='payment'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM order_events WHERE order_id='${o.orderId}' AND event_type='correction_requested'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `SELECT metadata->>'requestedModel' FROM order_events WHERE order_id='${o.orderId}' AND event_type='goal_interpreted'`,
    ),
    "text",
  );
  assert.equal(
    sql(
      `SELECT amount_units FROM ledger_entries WHERE order_id='${o.orderId}' AND entry_type='commission'`,
    ),
    "1",
  );
});
test("automatic payment requires explicit authorization and cannot change an existing contract mode", () => {
  const f = autonomousFixture();
  assert.throws(() => f.place("autonomous", false), /automatic_payment_authorization_required/);
  assert.equal(
    sql(`SELECT available_units FROM accounts WHERE company_id='${f.companyId}'`),
    "100",
  );
  const o = { ...f, ...f.place("manual", false, f.evaluated.selectedOffer) };
  browserRecord(o);
  assert.equal(advanceBrowser(o).status, "accepted");
  assert.throws(
    () => call(`settle_verified_order('${o.orderId}','bad')`),
    /human_approval_required/,
  );
  assert.throws(() => f.place(), /idempotency_conflict/);
  assert.equal(balance(o), "87,13,0");
});
test("different goals select different suppliers; insufficient budget and unsupported selection reserve nothing", () => {
  const desktop = autonomousFixture({
    scope: { supported: true, viewports: ["desktop"], form: false, reason: "Captura simples" },
    budget: 5,
  });
  const o = { ...desktop, ...desktop.place() };
  assert.equal(o.price, 4);
  browserRecord(o);
  assert.equal(advanceBrowser(o).status, "settled");
  const poor = autonomousFixture({ budget: 12 });
  assert.equal(poor.evaluated.selectedOffer, null);
  assert.throws(() => poor.place());
  const f = autonomousFixture();
  assert.throws(
    () => f.place("manual", false, "00000000-0000-0000-0000-000000002301"),
    /offer_does_not_cover_goal/,
  );
  assert.equal(
    sql(`SELECT available_units FROM accounts WHERE company_id='${f.companyId}'`),
    "100",
  );
});
test("invalid approved checks, expired quotes and exhausted correction never release funds", () => {
  const f = autonomousFixture(),
    o = { ...f, ...f.place() };
  browserRecord(o, "approved", true);
  assert.throws(() => advanceBrowser(o), /invalid_verification_checks/);
  assert.equal(balance(o), "87,13,0");
  const g = autonomousFixture(),
    x = { ...g, ...g.place() };
  browserRecord(x, "rejected", true);
  advanceBrowser(x);
  browserRecord(x, "rejected", true);
  assert.equal(advanceBrowser(x).status, "revision_requested");
  assert.equal(balance(x), "87,13,0");
  assert.throws(
    () => call(`advance_browser_contract('${randomUUID()}','${x.orderId}')`),
    /order_access_denied/,
  );
  const expired = autonomousFixture();
  sql(
    `ALTER TABLE browser_mission_quotes DISABLE TRIGGER browser_quotes_immutable; UPDATE browser_mission_quotes SET expires_at=now()-interval '1 minute' WHERE id='${expired.quoteId}'; ALTER TABLE browser_mission_quotes ENABLE TRIGGER browser_quotes_immutable;`,
  );
  assert.throws(() => expired.place(), /quote_expired/);
});
