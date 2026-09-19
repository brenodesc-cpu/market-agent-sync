// Run with: node --test tests/finance.postgres.test.mjs
// Creates and removes a private PostgreSQL cluster; never reads an external DATABASE_URL.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temp = mkdtempSync('/private/tmp/neuramarket-finance-');
const cluster = `${temp}/data`;
const port = 55000 + Math.floor(Math.random() * 9000);
const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', temp, '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
const platform = '00000000-0000-0000-0000-000000000004';
const criteria = [{ criterion: 'schema', expected: 'catalog-v1' }, { criterion: 'prices', expected: 'preserved' }];
const passed = criteria.map((c) => ({ ...c, status: 'passed', observed: c.expected }));
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
let started = false;

function sql(statement) {
  return execFileSync('psql', args, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function asyncSql(statement, env = {}) {
  const child = spawn('psql', args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; let error = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { error += data; });
  const done = new Promise((resolveDone, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolveDone(output.trim()) : reject(new Error(error)));
  });
  if (statement !== undefined) child.stdin.end(statement);
  return { child, done, output: () => output };
}

before(() => {
  execFileSync('initdb', ['-D', cluster, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe' });
  execFileSync('pg_ctl', ['-D', cluster, '-l', `${temp}/postgres.log`, '-o', `-F -p ${port} -k ${temp} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user_id',true),'')::uuid$$;
    CREATE TABLE storage.objects (bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT string_to_array($1,'/')$$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;`);
  for (const migration of ['0000_create_neuramarket_core.sql', '0001_add_financial_workflow_and_storage_policies.sql', '0002_harden_verification_settlement.sql']) {
    sql(readFileSync(`${root}/drizzle/migrations/${migration}`, 'utf8'));
  }
  sql(`INSERT INTO companies(id,name,slug,description,kind,is_demo) VALUES('${platform}','Platform','platform','Platform','platform',true);
    INSERT INTO accounts(company_id) VALUES('${platform}');`);
});

after(() => {
  if (started) execFileSync('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(temp, { recursive: true, force: true });
});

function fixture({ price = 100, missingBuyer = false, acceptance = criteria } = {}) {
  const f = { buyer: randomUUID(), supplier: randomUUID(), capability: randomUUID(), offer: randomUUID(), offerVersion: randomUUID(), order: randomUUID(), owner: randomUUID() };
  sql(`INSERT INTO companies(id,owner_user_id,name,slug,description,kind,is_demo) VALUES
    ('${f.buyer}','${f.owner}','Buyer','${f.buyer}','Buyer','buyer',true),
    ('${f.supplier}',NULL,'Supplier','${f.supplier}','Supplier','supplier',true);
    INSERT INTO accounts(company_id,available_units) VALUES('${f.supplier}',0);
    ${missingBuyer ? '' : `INSERT INTO accounts(company_id,available_units) VALUES('${f.buyer}',1000);`}
    INSERT INTO capabilities(id,company_id,code,name,description,executor_type) VALUES('${f.capability}','${f.supplier}','catalog','Catalog','Catalog','catalog');
    INSERT INTO offers(id,company_id,capability_id,title,published) VALUES('${f.offer}','${f.supplier}','${f.capability}','Catalog',true);
    INSERT INTO offer_versions(id,offer_id,version,description,price_units,deadline_hours,acceptance_criteria,cancellation_policy,available)
    VALUES('${f.offerVersion}','${f.offer}',1,'Catalog',${price},1,${json(acceptance)},'refund',true);
    INSERT INTO orders(id,buyer_company_id,offer_id,title,budget_cap_units,is_demo)
    VALUES('${f.order}','${f.buyer}','${f.offer}','Catalog',1000,true);`);
  return f;
}

function reserve(f, key = 'same-caller-key') {
  return JSON.parse(sql(`SELECT reserve_demo_order('${f.order}','${f.offerVersion}',${quote(key)});`));
}

function deliver(f, { decision = 'approved', checks = passed, hash = 'a'.repeat(64), supplier = f.supplier, version = 1, reportOrder = f.order, reportVersion = version } = {}) {
  const delivery = randomUUID();
  sql(`INSERT INTO deliveries(id,order_id,version,submitted_by_company_id,storage_path,file_name,media_type,byte_size,sha256)
    VALUES('${delivery}','${f.order}',${version},'${supplier}','${f.supplier}/${delivery}.json','catalog.json','application/json',32,${hash === null ? 'NULL' : quote(hash)});
    INSERT INTO verification_reports(order_id,delivery_id,delivery_version,rules_version,tool_name,checks,decision,summary)
    VALUES('${reportOrder}','${delivery}',${reportVersion},'catalog-v1','deterministic',${json(checks)},'${decision}','Result');
    UPDATE orders SET current_delivery_version=${version},status='accepted' WHERE id='${f.order}';`);
  return delivery;
}

function settle(f, key = 'same-caller-key') {
  return JSON.parse(sql(`SELECT settle_verified_order('${f.order}',${quote(key)});`));
}

function balances(f) {
  return sql(`SELECT available_units||','||reserved_units||','||paid_units FROM accounts WHERE company_id='${f.buyer}';`);
}

function rejectsSettlement(f, expected) {
  const before = balances(f);
  assert.throws(() => settle(f), expected);
  assert.equal(balances(f), before);
  assert.equal(sql(`SELECT count(*) FROM ledger_entries WHERE order_id='${f.order}' AND entry_type='payment';`), '0');
}

test('reserve and settle are idempotent; received credits become spendable', () => {
  const f = fixture();
  assert.equal(reserve(f).status, 'contracted');
  assert.equal(reserve(f, 'different-retry').status, 'contracted');
  assert.equal(balances(f), '900,100,0');
  deliver(f);
  assert.equal(settle(f).status, 'settled');
  assert.equal(settle(f, 'different-retry').status, 'already_settled');
  assert.equal(balances(f), '900,0,100');
  assert.equal(sql(`SELECT available_units||','||received_units FROM accounts WHERE company_id='${f.supplier}';`), '90,90');
  assert.equal(sql(`SELECT count(*) FROM ledger_entries WHERE order_id='${f.order}';`), '4');
});

test('concurrent settlements from separate PostgreSQL sessions transfer once', async () => {
  const f = fixture(); reserve(f); deliver(f);
  const first = asyncSql(undefined, { PGAPPNAME: 'finance-holder' });
  first.child.stdin.write(`BEGIN; SELECT id FROM orders WHERE id='${f.order}' FOR UPDATE; SELECT 'LOCK_READY';\n`);
  for (let i = 0; i < 100 && !first.output().includes('LOCK_READY'); i++) await new Promise((r) => setTimeout(r, 10));
  assert.match(first.output(), /LOCK_READY/);
  const second = asyncSql(`SELECT settle_verified_order('${f.order}','concurrent-2');`, { PGAPPNAME: 'finance-waiter' });
  let blocked = false;
  for (let i = 0; i < 100 && !blocked; i++) {
    blocked = sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='finance-waiter' AND wait_event_type='Lock';") === '1';
    if (!blocked) await new Promise((r) => setTimeout(r, 10));
  }
  first.child.stdin.end(`SELECT settle_verified_order('${f.order}','concurrent-1'); COMMIT;`);
  const outcomes = await Promise.all([first.done, second.done]);
  assert.equal(blocked, true, 'the second session must actually wait for the order lock');
  assert.match(outcomes[0], /"status": "settled"/);
  assert.equal(JSON.parse(outcomes[1]).status, 'already_settled');
  assert.equal(balances(f), '900,0,100');
  assert.equal(sql(`SELECT count(*) FROM ledger_entries WHERE order_id='${f.order}' AND entry_type='payment';`), '1');
});

test('error, inconclusive and rejected decisions preserve the reserve', () => {
  for (const decision of ['error', 'inconclusive', 'rejected']) {
    const f = fixture(); reserve(f); deliver(f, { decision });
    rejectsSettlement(f, /approved_current_verification_required/);
  }
});

test('empty, failing, duplicate, missing and mismatched checks cannot release payment', () => {
  for (const checks of [[], {}, [{ ...passed[0] }], [passed[0], passed[0]],
    [passed[0], { ...passed[1], status: 'failed' }], [passed[0], { ...passed[1], status: 'inconclusive' }],
    [passed[0], { ...passed[1], expected: 'different' }], [passed[0], { ...passed[1], criterion: 'uncontracted' }]]) {
    const f = fixture(); reserve(f); deliver(f, { checks });
    rejectsSettlement(f, /invalid_verification_checks/);
  }
});

test('wrong order, delivery version, supplier and missing hash all block payment', () => {
  const other = fixture(); reserve(other);
  for (const options of [{ reportOrder: other.order }, { reportVersion: 9 }, { supplier: other.supplier }, { hash: null }, { hash: 'not-a-hash' }]) {
    const f = fixture(); reserve(f); deliver(f, options);
    rejectsSettlement(f, /valid_current_delivery_required|approved_current_verification_required/);
  }
  const f = fixture(); reserve(f); deliver(f);
  sql(`UPDATE orders SET current_delivery_version=2 WHERE id='${f.order}';`);
  rejectsSettlement(f, /valid_current_delivery_required/);
});

test('missing accounts and invalid contract data cannot create financial movements', () => {
  const missing = fixture({ missingBuyer: true });
  assert.throws(() => reserve(missing), /buyer_account_required/);
  assert.equal(sql(`SELECT count(*) FROM contracts WHERE order_id='${missing.order}';`), '0');
  for (const target of ['supplier', 'buyer']) {
    const f = fixture(); reserve(f); deliver(f);
    sql(`DELETE FROM accounts WHERE company_id='${f[target]}';`);
    rejectsSettlement(f, /settlement_accounts_required/);
  }
  for (const change of ['commission_bps=10001', 'price_units=0']) {
    const f = fixture(); reserve(f); deliver(f);
    // Simulate corrupted historic data as a database administrator, never an application write.
    sql(`ALTER TABLE contracts DISABLE TRIGGER contracts_immutable; UPDATE contracts SET ${change} WHERE order_id='${f.order}'; ALTER TABLE contracts ENABLE TRIGGER contracts_immutable;`);
    rejectsSettlement(f, /invalid_contract/);
  }
});

test('legacy or duplicate contract criteria are rejected before reserving funds', () => {
  for (const acceptance of [{ schema: true }, [], [{ criterion: 'x' }], [criteria[0], criteria[0]]]) {
    const f = fixture({ acceptance });
    assert.throws(() => reserve(f), /invalid_acceptance_criteria/);
    assert.equal(balances(f), '1000,0,0');
  }
});

test('reusing caller keys across orders is safe; ledger collision rolls back the entire settlement', () => {
  const first = fixture(); const second = fixture();
  reserve(first); reserve(second); deliver(first); deliver(second);
  assert.equal(settle(first).status, 'settled');
  assert.equal(settle(second).status, 'settled');
  const f = fixture(); reserve(f); deliver(f);
  sql(`INSERT INTO ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
    VALUES('${f.buyer}','${f.order}','test-collision',1,'order:${f.order}:buyer','Conflict');`);
  rejectsSettlement(f, /duplicate key/);
});

test('zero commission is valid without a zero-valued ledger entry', () => {
  const f = fixture({ price: 1 }); reserve(f); deliver(f);
  const result = settle(f);
  assert.equal(result.commission_units, 0);
  assert.equal(result.payout_units, 1);
  assert.equal(sql(`SELECT count(*) FROM ledger_entries WHERE order_id='${f.order}' AND entry_type='commission';`), '0');
  assert.equal(sql(`SELECT available_units FROM accounts WHERE company_id='${f.supplier}';`), '1');
});

test('authenticated users can read demo contracts but cannot insert reports or deliver for another supplier', () => {
  const f = fixture(); reserve(f);
  const other = fixture();
  sql(`INSERT INTO user_roles(user_id,role) VALUES('${f.owner}','verifier');`);
  assert.equal(sql(`SET ROLE authenticated; SET test.user_id='${other.owner}'; SELECT count(*) FROM contracts WHERE order_id='${f.order}';`), '1');
  assert.throws(() => sql(`SET ROLE authenticated; SET test.user_id='${f.owner}';
    INSERT INTO verification_reports(order_id,delivery_id,delivery_version,rules_version,tool_name,checks,decision,summary)
    VALUES('${f.order}','${randomUUID()}',1,'v1','fake','[]','approved','Fake');`), /permission denied/);
  assert.throws(() => sql(`SET ROLE authenticated; SET test.user_id='${other.owner}';
    INSERT INTO deliveries(order_id,version,submitted_by_company_id,storage_path,file_name,media_type,byte_size)
    VALUES('${f.order}',1,'${other.buyer}','fake','fake','application/json',1);`), /row-level security/);
});
