import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  generateKeyPair,
  deriveAddress,
  validateAddress,
  signPayload,
  verifyPayload,
} from "../src/lib/chain/keys.ts";
import { canonicalize, txid, buildTransaction, verifyTransaction } from "../src/lib/chain/tx.ts";
import { merkleRoot, merkleProof, verifyMerkleProof } from "../src/lib/chain/merkle.ts";
import { canonicalizeHeader, blockHash, GENESIS_PREV_HASH } from "../src/lib/chain/block.ts";
import { validateChain, deriveBalances } from "../src/lib/chain/validate.ts";
import {
  CHAIN_ID,
  type ChainBlock,
  type ChainTransaction,
  type TransactionPayload,
} from "../src/lib/chain/types.ts";
import {
  encryptPrivateKey,
  signEncryptedPayload,
  ensureCompanyWallet,
  nextNonce,
  checkChainError,
} from "../src/lib/chain/wallet.server.ts";
import { anchorStatus } from "../src/lib/chain/anchor.server.ts";
import {
  getTransaction,
  submitSignedTransactions,
  listTransactions,
} from "../src/lib/chain/node.server.ts";

const treasury = generateKeyPair();
const buyer = generateKeyPair();
const supplier = generateKeyPair();
const custody = generateKeyPair();
const treasuryAddress = deriveAddress(treasury.publicKey);
const buyerAddress = deriveAddress(buyer.publicKey);
const supplierAddress = deriveAddress(supplier.publicKey);
const custodyAddress = deriveAddress(custody.publicKey);
const timestamp = "2026-09-19T00:00:00.000Z";
function payload(fields: Partial<TransactionPayload> = {}): TransactionPayload {
  return {
    amount: 100,
    chain_id: CHAIN_ID,
    from: null,
    to: buyerAddress,
    issued_at: timestamp,
    memo: "",
    nonce: 0,
    payload_hash: null,
    ref_id: null,
    ref_kind: null,
    type: "MINT",
    ...fields,
  };
}
function signed(fields: Partial<TransactionPayload> = {}, key = treasury): ChainTransaction {
  return buildTransaction(payload(fields), key.privateKey, key.publicKey);
}
function block(height: number, previous: string, txs: ChainTransaction[]): ChainBlock {
  const header = {
    chain_id: CHAIN_ID,
    height,
    prev_hash: previous,
    merkle_root: merkleRoot(txs.map((tx) => tx.txid)),
    tx_count: txs.length,
    validator: treasuryAddress,
    sealed_at: timestamp,
  };
  return { ...header, block_hash: blockHash(header) };
}
function fixture() {
  const mint = signed();
  const reserve = signed(
    {
      type: "RESERVE",
      from: buyerAddress,
      to: custodyAddress,
      amount: 40,
      ref_kind: "order",
      ref_id: "order-1",
    },
    buyer,
  );
  const transfer = signed(
    {
      type: "TRANSFER",
      from: custodyAddress,
      to: supplierAddress,
      amount: 36,
      ref_kind: "order",
      ref_id: "order-1",
    },
    custody,
  );
  const fee = signed(
    {
      type: "FEE",
      from: custodyAddress,
      to: treasuryAddress,
      amount: 4,
      nonce: 1,
      ref_kind: "order",
      ref_id: "order-1",
    },
    custody,
  );
  const anchor = signed(
    {
      type: "ANCHOR",
      from: supplierAddress,
      to: null,
      amount: 0,
      payload_hash: "ab".repeat(32),
      ref_kind: "delivery",
    },
    supplier,
  );
  const txs: Record<number, ChainTransaction[]> = {
    0: [mint],
    1: [reserve],
    2: [transfer, fee, anchor],
  };
  const first = block(0, GENESIS_PREV_HASH, txs[0]!);
  const second = block(1, first.block_hash, txs[1]!);
  const third = block(2, second.block_hash, txs[2]!);
  return { blocks: [first, second, third], txs };
}
function hasCode(result: ReturnType<typeof validateChain>, code: string) {
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((issue) => issue.code === code),
    JSON.stringify(result),
  );
}

test("endereço determinístico: vetor conhecido, checksum e alteração de um caractere", () => {
  // DER/SPKI secp256k1 generator point, independent of a random fixture key.
  const spki =
    "3056301006072a8648ce3d020106052b8104000a0342000479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
  const body = createHash("sha256").update(Buffer.from(spki, "hex")).digest("hex").slice(0, 40);
  const expected = `nmk1${body}${createHash("sha256").update(body).digest("hex").slice(0, 4)}`;
  assert.equal(deriveAddress(spki), expected);
  assert.equal(deriveAddress(spki), deriveAddress(spki));
  assert.equal(expected.length, 48);
  assert.ok(validateAddress(expected));
  assert.equal(
    validateAddress(`${expected.slice(0, -1)}${expected.endsWith("0") ? "1" : "0"}`),
    false,
  );
  assert.equal(validateAddress(expected.toUpperCase()), false);
  assert.equal(validateAddress(null), false);
});
test("chaves públicas de outra curva e DER inválido são rejeitados", () => {
  const wrong = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  assert.throws(() =>
    deriveAddress(wrong.publicKey.export({ type: "spki", format: "der" }).toString("hex")),
  );
  assert.throws(() => deriveAddress("00"));
  assert.throws(() => deriveAddress(`${treasury.publicKey}00`));
});
test("forma canônica ordena chaves recursivamente e ignora ordem de inserção", () => {
  assert.equal(
    canonicalize({ z: [3, { b: "é", a: null }], a: 1 }),
    '{"a":1,"z":[3,{"a":null,"b":"é"}]}',
  );
  assert.equal(canonicalize({ b: 2, a: 1 }), canonicalize({ a: 1, b: 2 }));
  const tx = signed();
  const reversed = Object.fromEntries(Object.entries(payload()).reverse()) as TransactionPayload;
  assert.equal(txid(reversed), tx.txid);
  assert.equal(tx.canonical.includes("public_key"), false);
  assert.equal(tx.canonical.includes("idempotency_key"), false);
  assert.equal(tx.canonical.includes("amount_units"), false);
  assert.equal(tx.canonical, canonicalize(payload()));
});
test("serialização rejeita valores não canônicos e números inexatos", () => {
  for (const value of [
    NaN,
    Infinity,
    undefined,
    1n,
    -0,
    Number.MAX_SAFE_INTEGER + 1,
    new Date(),
    [undefined],
  ])
    assert.throws(() => canonicalize(value));
});
test("assinatura válida aceita; outra chave, bytes alterados e assinatura truncada rejeitados", () => {
  const tx = signed();
  assert.ok(verifyTransaction(tx, treasuryAddress));
  assert.ok(verifyPayload(tx.canonical, tx.signature, treasury.publicKey));
  assert.equal(verifyPayload(tx.canonical, tx.signature, buyer.publicKey), false);
  assert.equal(verifyPayload(tx.canonical + " ", tx.signature, treasury.publicKey), false);
  assert.equal(verifyPayload(tx.canonical, tx.signature.slice(2), treasury.publicKey), false);
  assert.equal(verifyTransaction({ ...tx, amount: 101 }), false);
  assert.equal(verifyTransaction({ ...tx, amount_units: 101 }), false);
});
test("endereço from deve corresponder à chave e MINT só autoriza a tesouraria", () => {
  assert.throws(() =>
    signed({ type: "TRANSFER", from: buyerAddress, to: supplierAddress }, supplier),
  );
  assert.equal(verifyTransaction(signed({}, buyer), treasuryAddress), false);
  const f = fixture();
  f.txs[0] = [signed({}, buyer)];
  hasCode(validateChain(f.blocks, f.txs), "SIGNATURE");
});
test("domínios e regras de todos os tipos falham fechados", () => {
  for (const fields of [
    { amount: -1 },
    { amount: 0 },
    { amount: 1.5 },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { nonce: -1 },
    { nonce: 0.1 },
    { from: buyerAddress },
    { to: null },
    { memo: "a".repeat(201) },
    { issued_at: "2026-02-30T00:00:00.000Z" },
    { chain_id: "outra" },
    { type: "UNKNOWN" },
  ])
    assert.throws(() => signed(fields as Partial<TransactionPayload>));
  assert.throws(() => signed({ type: "TRANSFER", from: buyerAddress, to: buyerAddress }, buyer));
  assert.throws(() => signed({ type: "ANCHOR", amount: 0, from: buyerAddress, to: null }, buyer));
  assert.throws(() =>
    signed(
      { type: "ANCHOR", amount: 1, from: buyerAddress, to: null, payload_hash: "aa".repeat(32) },
      buyer,
    ),
  );
});
test("Merkle: vetor fixo, vazio e folha única", () => {
  const a = "00".repeat(32);
  const b = "11".repeat(32);
  assert.equal(
    merkleRoot([a, b]),
    "8878b15a7d6a3a4f464e8f9f42591dbc0cf4bedea0ec309003d2b2ee53655ef8",
  );
  assert.equal(merkleRoot([]), GENESIS_PREV_HASH);
  assert.equal(merkleRoot([b]), b);
  assert.ok(verifyMerkleProof(b, [], b));
});
test("Merkle ímpar duplica último nó, todas as provas fecham e provas forjadas falham", () => {
  const leaves = ["11".repeat(32), "22".repeat(32), "33".repeat(32)];
  const hash = (a: string, b: string) =>
    createHash("sha256")
      .update(Buffer.from(a + b, "hex"))
      .digest("hex");
  const expected = hash(hash(leaves[0]!, leaves[1]!), hash(leaves[2]!, leaves[2]!));
  assert.equal(merkleRoot(leaves), expected);
  for (let i = 0; i < leaves.length; i++)
    assert.ok(verifyMerkleProof(leaves[i]!, merkleProof(leaves, i), expected));
  const proof = merkleProof(leaves, 0);
  assert.equal(
    verifyMerkleProof(
      leaves[0]!,
      [{ ...proof[0]!, hash: GENESIS_PREV_HASH }, ...proof.slice(1)],
      expected,
    ),
    false,
  );
  assert.equal(
    verifyMerkleProof(leaves[0]!, [{ ...proof[0]!, position: "invalid" as "left" }], expected),
    false,
  );
  assert.equal(verifyMerkleProof("xx", [], expected), false);
  assert.throws(() => merkleProof([], 0));
  assert.throws(() => merkleProof(leaves, -1));
  assert.throws(() => merkleRoot(["xx"]));
});
test("cadeia de vários blocos, reserva, repasse, taxa e âncora são verificáveis", () => {
  const f = fixture();
  assert.deepEqual(validateChain(f.blocks, f.txs), { valid: true, height: 2, issues: [] });
  assert.equal(
    validateChain(f.blocks, new Map(Object.entries(f.txs).map(([k, v]) => [Number(k), v]))).valid,
    true,
  );
  assert.deepEqual(deriveBalances(Object.values(f.txs).flat()), {
    [buyerAddress]: 60,
    [custodyAddress]: 0,
    [supplierAddress]: 36,
    [treasuryAddress]: 4,
  });
  assert.equal(canonicalizeHeader(f.blocks[0]!).includes("block_hash"), false);
});
for (const [field, code] of [
  ["prev_hash", "PREV_HASH"],
  ["merkle_root", "MERKLE_ROOT"],
  ["block_hash", "BLOCK_HASH"],
] as const) {
  test(`adulteração de ${field} produz ${code}`, () => {
    const f = fixture();
    f.blocks[1]![field] = "ff".repeat(32);
    hasCode(validateChain(f.blocks, f.txs), code);
  });
}
test("adulteração de valor produz TXID e SIGNATURE", () => {
  const f = fixture();
  f.txs[1]![0]!.amount++;
  const result = validateChain(f.blocks, f.txs);
  hasCode(result, "TXID");
  hasCode(result, "SIGNATURE");
});
test("nonce alterado, repetido ou com lacuna é detectado", () => {
  const f = fixture();
  f.txs[2]![1]!.nonce = 0;
  hasCode(validateChain(f.blocks, f.txs), "NONCE");
  const mint0 = signed();
  const mintGap = signed({ nonce: 2 });
  const txs = [mint0, mintGap];
  hasCode(validateChain([block(0, GENESIS_PREV_HASH, txs)], { 0: txs }), "NONCE");
  const repeated = [mint0, signed({ to: supplierAddress })];
  hasCode(validateChain([block(0, GENESIS_PREV_HASH, repeated)], { 0: repeated }), "NONCE");
});
test("MINT e ANCHOR compartilham o espaço de nonce da tesouraria", () => {
  const txs = [
    signed(),
    signed({
      type: "ANCHOR",
      from: treasuryAddress,
      to: null,
      amount: 0,
      nonce: 1,
      payload_hash: "aa".repeat(32),
    }),
    signed({ nonce: 2 }),
  ];
  assert.ok(validateChain([block(0, GENESIS_PREV_HASH, txs)], { 0: txs }).valid);
});
test("saldo insuficiente é rejeitado mesmo com assinatura e Merkle válidos", () => {
  const txs = [
    signed(),
    signed({ type: "TRANSFER", from: buyerAddress, to: supplierAddress, amount: 101 }, buyer),
  ];
  hasCode(validateChain([block(0, GENESIS_PREV_HASH, txs)], { 0: txs }), "BALANCE");
  assert.throws(() => deriveBalances(txs), /Saldo NMK insuficiente/);
});
test("saldo agregado não pode exceder limite seguro", () => {
  const txs = [signed({ amount: Number.MAX_SAFE_INTEGER }), signed({ nonce: 1, amount: 1 })];
  hasCode(validateChain([block(0, GENESIS_PREV_HASH, txs)], { 0: txs }), "BALANCE");
});
test("RELEASE devolve da custódia ao comprador", () => {
  const f = fixture();
  const txs = [
    f.txs[0]![0]!,
    f.txs[1]![0]!,
    signed(
      {
        type: "RELEASE",
        from: custodyAddress,
        to: buyerAddress,
        amount: 40,
        ref_kind: "order",
        ref_id: "order-1",
      },
      custody,
    ),
  ];
  assert.ok(validateChain([block(0, GENESIS_PREV_HASH, txs)], { 0: txs }).valid);
  assert.equal(deriveBalances(txs)[buyerAddress], 100);
  assert.equal(deriveBalances(txs)[custodyAddress], 0);
});
test("quantidade, altura, duplicação, rede, ordem e troca de validador são detectadas", () => {
  let f = fixture();
  f.blocks[1]!.tx_count++;
  hasCode(validateChain(f.blocks, f.txs), "TX_COUNT");
  f = fixture();
  f.blocks[1]!.height = 9;
  hasCode(validateChain(f.blocks, f.txs), "HEIGHT");
  f = fixture();
  f.txs[2]!.push(f.txs[0]![0]!);
  hasCode(validateChain(f.blocks, f.txs), "DUPLICATE_TXID");
  f = fixture();
  f.blocks[1]!.chain_id = "outra";
  hasCode(validateChain(f.blocks, f.txs), "CHAIN_ID");
  f = fixture();
  f.txs[2]![0]!.block_index = 2;
  hasCode(validateChain(f.blocks, f.txs), "TX_ORDER");
  f = fixture();
  f.blocks[1]!.validator = buyerAddress;
  hasCode(validateChain(f.blocks, f.txs), "VALIDATOR");
  f = fixture();
  f.txs[9] = [];
  hasCode(validateChain(f.blocks, f.txs), "ORPHAN_TRANSACTIONS");
  hasCode(validateChain([], {}), "EMPTY_CHAIN");
});
test("AES-256-GCM: ida e volta sem retornar chave privada, IV novo a cada cifra", () => {
  const secret = randomBytes(32);
  const encrypted = encryptPrivateKey(buyer.privateKey, secret);
  const second = encryptPrivateKey(buyer.privateKey, secret);
  const message = "prova de recuperação da chave";
  const signature = signEncryptedPayload(message, encrypted, secret);
  assert.ok(verifyPayload(message, signature, buyer.publicKey));
  assert.notEqual(encrypted.iv, second.iv);
  assert.equal(encrypted.iv.length, 24);
  assert.equal(encrypted.auth_tag.length, 32);
  assert.ok(
    !JSON.stringify(encrypted).includes(
      buyer.privateKey.export({ type: "pkcs8", format: "der" }).toString("hex"),
    ),
  );
});

test("entrada malformada retorna validação inválida sem exceção nem detalhes internos", () => {
  hasCode(validateChain([null] as unknown as ChainBlock[], {}), "MALFORMED_CHAIN");
  const f = fixture();
  f.txs[1] = [null] as unknown as ChainTransaction[];
  hasCode(validateChain(f.blocks, f.txs), "MALFORMED_CHAIN");
});
test("GCM rejeita cifra, tag, IV e segredo adulterados com mensagem segura", () => {
  const secret = randomBytes(32);
  const encrypted = encryptPrivateKey(buyer.privateKey, secret);
  const flip = (hex: string) => `${hex.startsWith("00") ? "01" : "00"}${hex.slice(2)}`;
  for (const field of ["encrypted_private_key", "auth_tag", "iv"] as const)
    assert.throws(
      () => signEncryptedPayload("x", { ...encrypted, [field]: flip(encrypted[field]) }, secret),
      /^Error: Não foi possível abrir a carteira custodial NMK\.$/,
    );
  assert.throws(
    () => signEncryptedPayload("x", encrypted, randomBytes(32)),
    /Não foi possível abrir/,
  );
  assert.throws(
    () => encryptPrivateKey(buyer.privateKey, Buffer.alloc(1)),
    /Não foi possível proteger/,
  );
});
test("sem segredo ou com segredo inválido, criação falha antes de acessar banco", async () => {
  const before = process.env["NMK_WALLET_SECRET"];
  try {
    delete process.env["NMK_WALLET_SECRET"];
    await assert.rejects(
      ensureCompanyWallet("00000000-0000-0000-0000-000000000004"),
      /NMK_WALLET_SECRET não configurada/,
    );
    process.env["NMK_WALLET_SECRET"] = "segredo-inválido-que-não-deve-vazar";
    await assert.rejects(
      ensureCompanyWallet("00000000-0000-0000-0000-000000000004"),
      (error: Error) =>
        error.message.includes("NMK_WALLET_SECRET inválida") &&
        !error.message.includes("segredo-inválido"),
    );
  } finally {
    if (before === undefined) delete process.env["NMK_WALLET_SECRET"];
    else process.env["NMK_WALLET_SECRET"] = before;
  }
});
test("endereços e filtros inválidos são rejeitados antes de qualquer banco", async () => {
  await assert.rejects(nextNonce("nmk1invalid"), /Endereço NMK inválido/);
  await assert.rejects(getTransaction("invalid"));
  await assert.rejects(listTransactions({ height: -1 }));
  await assert.rejects(
    submitSignedTransactions([{ ...signed(), from_address: "invalid", idempotency_key: "x" }]),
  );
  assert.deepEqual(await submitSignedTransactions([]), []);
});
test("erros SQL não expõem detalhes e nonce tem código estável", () => {
  assert.throws(() => checkChainError({ message: "NMK_NONCE_CONFLICT" }), /NMK_NONCE_CONFLICT/);
  assert.throws(
    () => checkChainError({ message: "private key sensitive value", code: "23514" }),
    (error: Error) => !error.message.includes("sensitive"),
  );
});
test("âncora não simula publicação, inclusive com ambiente configurado sem driver", async () => {
  const names = ["NMK_ANCHOR_RPC_URL", "NMK_ANCHOR_ACCOUNT"];
  const before = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    let state = await anchorStatus();
    assert.equal(state.status, "unavailable");
    assert.equal(state.external_tx_hash, null);
    process.env["NMK_ANCHOR_RPC_URL"] = "https://example.invalid";
    process.env["NMK_ANCHOR_ACCOUNT"] = "account";
    state = await anchorStatus();
    assert.equal(state.status, "unavailable");
    assert.equal(state.external_tx_hash, null);
    assert.match(state.safe_message, /driver/);
  } finally {
    names.forEach((name, i) => {
      if (before[i] === undefined) delete process.env[name];
      else process.env[name] = before[i];
    });
  }
});
test("fronteira dos módulos puros não importa banco, rede ou ambiente", () => {
  for (const file of ["keys", "tx", "merkle", "block", "validate", "types"]) {
    const source = readFileSync(new URL(`../src/lib/chain/${file}.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /process\.env|supabase|fetch\(|\.server[".]/i);
  }
});
