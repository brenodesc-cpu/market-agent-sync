import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";
import { deriveAddress, generateKeyPair, signPayload, validateAddress } from "./keys.ts";
import { assertTransactionPayload, buildTransaction } from "./tx.ts";
import type { ChainTransaction, ChainWalletPublic, TransactionPayload } from "./types.ts";

const walletColumns = "id,company_id,kind,address,public_key,key_version,created_at";
const companyIdSchema = z.string().uuid("Empresa inválida.");
type EncryptedKey = { encrypted_private_key: string; iv: string; auth_tag: string };

// Lazy loading keeps encryption tests independent from the application and database.
export async function chainDb() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server.ts");
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
}
export function checkChainError(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.message === "NMK_NONCE_CONFLICT")
    throw new Error(
      "NMK_NONCE_CONFLICT: O nonce NMK mudou. Atualize a carteira e assine novamente.",
    );
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? ""))
    throw new Error(
      "PGRST205: A migration 0008_nmk_chain.sql ainda precisa ser aplicada ao banco.",
    );
  // Do not forward database details: a failed key insert can contain ciphertext or other secrets.
  throw new Error(
    "Não foi possível concluir a operação NMK. Confira a configuração e tente novamente.",
  );
}
function walletSecret(): Buffer {
  const value = process.env["NMK_WALLET_SECRET"];
  if (!value)
    throw new Error("NMK_WALLET_SECRET não configurada. A carteira custodial está indisponível.");
  const hex = /^[0-9a-fA-F]{64}$/.test(value);
  if (!hex && !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error("NMK_WALLET_SECRET inválida. Configure uma chave de cifra de 32 bytes.");
  const secret = Buffer.from(value, hex ? "hex" : "base64");
  if (secret.length !== 32 || (!hex && secret.toString("base64") !== value))
    throw new Error("NMK_WALLET_SECRET inválida. Configure uma chave de cifra de 32 bytes.");
  return secret;
}
export function encryptPrivateKey(key: KeyObject, secret: Buffer): EncryptedKey {
  let raw: Buffer | undefined;
  try {
    if (
      secret.length !== 32 ||
      key.type !== "private" ||
      key.asymmetricKeyDetails?.namedCurve !== "secp256k1"
    )
      throw new Error();
    raw = key.export({ type: "pkcs8", format: "der" });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", secret, iv);
    const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
    return {
      encrypted_private_key: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      auth_tag: cipher.getAuthTag().toString("hex"),
    };
  } catch {
    throw new Error("Não foi possível proteger a chave da carteira NMK.");
  } finally {
    raw?.fill(0);
  }
}
function decryptPrivateKey(encrypted: EncryptedKey, secret: Buffer): KeyObject {
  let raw: Buffer | undefined;
  let partial: Buffer | undefined;
  try {
    if (
      secret.length !== 32 ||
      !/^[0-9a-f]{24}$/.test(encrypted.iv) ||
      !/^[0-9a-f]{32}$/.test(encrypted.auth_tag) ||
      !/^(?:[0-9a-f]{2})+$/.test(encrypted.encrypted_private_key)
    )
      throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(encrypted.iv, "hex"));
    cipher.setAuthTag(Buffer.from(encrypted.auth_tag, "hex"));
    partial = cipher.update(Buffer.from(encrypted.encrypted_private_key, "hex"));
    raw = Buffer.concat([partial, cipher.final()]);
    return createPrivateKey({ key: raw, type: "pkcs8", format: "der" });
  } catch {
    throw new Error("Não foi possível abrir a carteira custodial NMK.");
  } finally {
    raw?.fill(0);
    partial?.fill(0);
  }
}
// Testable round-trip without exporting decrypted private material from this server module.
export function signEncryptedPayload(
  payload: string,
  encrypted: EncryptedKey,
  secret: Buffer,
): string {
  return signPayload(payload, decryptPrivateKey(encrypted, secret));
}

async function findWallet(
  companyId: string | null,
  kind: ChainWalletPublic["kind"],
): Promise<ChainWalletPublic | null> {
  const db = await chainDb();
  let query = db.from("chain_wallets").select(walletColumns).eq("kind", kind);
  query = companyId === null ? query.is("company_id", null) : query.eq("company_id", companyId);
  const result = await query.maybeSingle();
  checkChainError(result.error);
  return result.data as ChainWalletPublic | null;
}
async function ensureWallet(
  companyId: string | null,
  kind: ChainWalletPublic["kind"],
): Promise<ChainWalletPublic> {
  const secret = walletSecret();
  try {
    const existing = await findWallet(companyId, kind);
    if (existing) return existing;
    const pair = generateKeyPair();
    const encrypted = encryptPrivateKey(pair.privateKey, secret);
    const db = await chainDb();
    const result = await db.rpc("chain_create_wallet", {
      _company_id: companyId,
      _kind: kind,
      _address: deriveAddress(pair.publicKey),
      _public_key: pair.publicKey,
      _encrypted_private_key: encrypted.encrypted_private_key,
      _iv: encrypted.iv,
      _auth_tag: encrypted.auth_tag,
    });
    checkChainError(result.error);
    // Select an explicit allowlist even if the RPC response changes in a later migration.
    const wallet = await findWallet(companyId, kind);
    if (!wallet) throw new Error("A carteira NMK ainda não está disponível.");
    return wallet;
  } finally {
    secret.fill(0);
  }
}

// Internal service APIs: HTTP handlers must authorize company membership before calling.
export async function ensureCompanyWallet(companyId: string): Promise<ChainWalletPublic> {
  return ensureWallet(companyIdSchema.parse(companyId), "company");
}
export async function getCompanyWalletPublic(companyId: string): Promise<ChainWalletPublic | null> {
  return findWallet(companyIdSchema.parse(companyId), "company");
}
export async function treasuryAddress(): Promise<string> {
  return (await ensureWallet(null, "treasury")).address;
}
export async function custodyAddress(): Promise<string> {
  return (await ensureWallet(null, "custody")).address;
}

async function signWithWallet(
  wallet: ChainWalletPublic,
  payload: TransactionPayload,
): Promise<ChainTransaction> {
  assertTransactionPayload(payload);
  if (payload.type === "MINT" ? wallet.kind !== "treasury" : payload.from !== wallet.address)
    throw new Error("A carteira não está autorizada a assinar esta transação NMK.");
  if (
    payload.type === "RESERVE" &&
    (payload.to !== (await custodyAddress()) || wallet.kind !== "company")
  )
    throw new Error("A reserva deve partir do comprador para a custódia NMK.");
  if (payload.type === "RELEASE" && wallet.kind !== "custody")
    throw new Error("A devolução deve partir da custódia NMK.");
  const secret = walletSecret();
  try {
    const db = await chainDb();
    const result = await db
      .from("chain_wallet_keys")
      .select("encrypted_private_key,iv,auth_tag")
      .eq("wallet_id", wallet.id)
      .single();
    checkChainError(result.error);
    return buildTransaction(
      payload,
      decryptPrivateKey(result.data as EncryptedKey, secret),
      wallet.public_key,
    );
  } finally {
    secret.fill(0);
  }
}
export async function signAsCompany(
  companyId: string,
  payload: TransactionPayload,
): Promise<ChainTransaction> {
  assertTransactionPayload(payload); // Check addresses before querying the database.
  return signWithWallet(await ensureCompanyWallet(companyId), payload);
}
export async function signAsTreasury(payload: TransactionPayload): Promise<ChainTransaction> {
  assertTransactionPayload(payload);
  return signWithWallet(await ensureWallet(null, "treasury"), payload);
}
export async function signAsCustody(payload: TransactionPayload): Promise<ChainTransaction> {
  assertTransactionPayload(payload);
  return signWithWallet(await ensureWallet(null, "custody"), payload);
}
export async function nextNonce(address: string): Promise<number> {
  if (!validateAddress(address)) throw new Error("Endereço NMK inválido.");
  const db = await chainDb();
  const wallet = await db
    .from("chain_wallets")
    .select("public_key")
    .eq("address", address)
    .single();
  checkChainError(wallet.error);
  const result = await db
    .from("chain_transactions")
    .select("nonce")
    .eq("public_key", wallet.data!.public_key)
    .order("nonce", { ascending: false })
    .limit(1);
  checkChainError(result.error);
  const nonce = (result.data?.[0]?.nonce ?? -1) + 1;
  return z.number().int().min(0).max(2147483647).parse(nonce);
}
