import { CHAIN_ID } from "./chain/types";
import type { ChainTransaction, TransactionPayload } from "./chain/types";

// Bridge between the order flow and the NMK record.
//
// Two rules govern everything here. First, the chain is additive: the credit ledger stays the
// source of financial truth, so a chain failure must never block a contract, a delivery or a
// settlement. Every entry point below either falls back to the untouched original path or
// reports the failure without raising. Second, nothing is faked: when the layer is absent the
// caller learns the record was not written, and reconciliation later shows the gap.

export type BridgeResult = { recorded: boolean; reason?: string };

type Wallets = typeof import("./chain/wallet.server");
type Node = typeof import("./chain/node.server");
type Tx = typeof import("./chain/tx");
type Loaded = { wallets: Wallets; node: Node; tx: Tx };

const NONCE_CONFLICT = /NMK_NONCE_CONFLICT/;

// The platform's credit account belongs to this company, so the commission has to land on that
// company's address for reconciliation to close. The treasury only mints.
const PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000004";

async function modules(): Promise<Loaded | null> {
  try {
    const [wallets, node, tx] = await Promise.all([
      import("./chain/wallet.server"),
      import("./chain/node.server"),
      import("./chain/tx"),
    ]);
    return { wallets, node, tx };
  } catch {
    return null;
  }
}

function payload(base: Partial<TransactionPayload> & Pick<TransactionPayload, "type">) {
  return {
    amount: 0,
    chain_id: CHAIN_ID,
    from: null,
    issued_at: new Date().toISOString(),
    memo: "",
    nonce: 0,
    payload_hash: null,
    ref_id: null,
    ref_kind: null,
    to: null,
    ...base,
  } satisfies TransactionPayload;
}

function withKey(tx: ChainTransaction, idempotencyKey: string): ChainTransaction {
  return { ...tx, idempotency_key: idempotencyKey };
}

/**
 * Whether an entry already exists under this key.
 *
 * Signing again produces a different issued_at and nonce, so the same idempotency key would
 * arrive carrying a different txid and be rejected — correctly, but as an error rather than as
 * the no-op it should be. Checking first turns a repeat into a confirmation.
 */
async function alreadyRecorded(idempotencyKeys: string[]): Promise<boolean> {
  const { runtimeDb } = await import("./studio-runtime.server");
  const db = await runtimeDb();
  const found = await db
    .from("chain_transactions")
    .select("idempotency_key")
    .in("idempotency_key", idempotencyKeys);
  if (found.error) return false;
  return (found.data ?? []).length >= idempotencyKeys.length;
}

/**
 * Nonces are checked atomically in the database, so a concurrent signer can lose the race.
 * Losing it means re-reading the nonce and signing again, because the nonce sits inside the
 * signed canonical form and the previous envelope cannot be reused.
 */
async function submitWithRetry(
  loaded: Loaded,
  keys: string[],
  sign: (nonce: number) => Promise<ChainTransaction[]>,
  nonceOf: () => Promise<number>,
  attempts = 3,
): Promise<void> {
  if (await alreadyRecorded(keys)) return;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await loaded.node.submitSignedTransactions(await sign(await nonceOf()));
      return;
    } catch (error) {
      lastError = error;
      if (!NONCE_CONFLICT.test(error instanceof Error ? error.message : String(error))) throw error;
      if (await alreadyRecorded(keys)) return;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Mirrors a company's existing credit position onto the chain, exactly once.
 *
 * Companies hold credits before the chain exists, so without this the derived chain balance
 * would be zero and the first reserve would fail the no-negative-balance rule. The mint
 * acknowledges a balance the ledger already granted; it never creates value the ledger does
 * not already show.
 *
 * Reserves opened before the chain existed are mirrored too, under the same idempotency key
 * the ordinary reservation path uses, so the two can never double-count each other. Without
 * this the reserved side of reconciliation would diverge for every pre-chain order.
 */
export async function ensureBootstrapMint(companyId: string): Promise<BridgeResult> {
  const loaded = await modules();
  if (!loaded) return { recorded: false, reason: "layer_absent" };
  try {
    const { wallets } = loaded;
    const { runtimeDb } = await import("./studio-runtime.server");
    const db = await runtimeDb();
    const account = await db
      .from("accounts")
      .select("available_units,reserved_units")
      .eq("company_id", companyId)
      .maybeSingle();
    if (account.error || !account.data) return { recorded: false, reason: "no_account" };

    const available = Number(account.data.available_units);
    const reserved = Number(account.data.reserved_units);
    const total = available + reserved;
    if (total <= 0) return { recorded: true };

    const wallet = await wallets.ensureCompanyWallet(companyId);
    const treasury = await wallets.treasuryAddress();
    const key = `company:${companyId}:bootstrap`;
    await submitWithRetry(
      loaded,
      [key],
      async (nonce) => [
        withKey(
          await wallets.signAsTreasury(
            payload({
              type: "MINT",
              amount: total,
              to: wallet.address,
              nonce,
              ref_kind: "treasury",
              ref_id: companyId,
              memo: "Espelho do saldo de créditos já concedido pelo ledger",
            }),
          ),
          key,
        ),
      ],
      () => wallets.nextNonce(treasury),
    );

    if (reserved > 0) await mirrorOpenReserves(loaded, companyId, wallet.address);
    return { recorded: true };
  } catch (error) {
    return { recorded: false, reason: reasonOf(error) };
  }
}

/** Reserves the ledger still holds, emitted under the ordinary reservation key. */
async function mirrorOpenReserves(loaded: Loaded, companyId: string, address: string) {
  const { wallets } = loaded;
  const { runtimeDb } = await import("./studio-runtime.server");
  const db = await runtimeDb();
  const open = await db
    .from("orders")
    .select("id,status,contracts(price_units)")
    .eq("buyer_company_id", companyId)
    .not("status", "in", "(draft,settled,cancelled,expired)")
    .limit(200);
  if (open.error) return;

  const custody = await wallets.custodyAddress();
  for (const order of open.data ?? []) {
    const contract = Array.isArray(order.contracts) ? order.contracts[0] : order.contracts;
    const price = Number(contract?.price_units ?? 0);
    if (!Number.isSafeInteger(price) || price <= 0) continue;
    const key = `order:${order.id}:reservation`;
    try {
      await submitWithRetry(
        loaded,
        [key],
        async (nonce) => [
          withKey(
            await wallets.signAsCompany(
              companyId,
              payload({
                type: "RESERVE",
                amount: price,
                from: address,
                to: custody,
                nonce,
                ref_kind: "order",
                ref_id: order.id as string,
                memo: "Reserva aberta antes do registro NMK existir",
              }),
            ),
            key,
          ),
        ],
        () => wallets.nextNonce(address),
      );
    } catch {
      // One unrecordable order must not stop the others; reconciliation reports what is missing.
    }
  }
}

/** Reservation of the contracted price, emitted once the order id exists. */
export async function recordReservation(
  orderId: string,
  buyerCompanyId: string,
  priceUnits: number,
): Promise<BridgeResult> {
  const loaded = await modules();
  if (!loaded) return { recorded: false, reason: "layer_absent" };
  try {
    const { wallets } = loaded;
    // The mirror runs first and already covers this order, since it is open by now. The shared
    // idempotency key turns the write below into a confirmation rather than a duplicate.
    await ensureBootstrapMint(buyerCompanyId);
    const wallet = await wallets.ensureCompanyWallet(buyerCompanyId);
    const custody = await wallets.custodyAddress();
    const key = `order:${orderId}:reservation`;
    await submitWithRetry(
      loaded,
      [key],
      async (nonce) => [
        withKey(
          await wallets.signAsCompany(
            buyerCompanyId,
            payload({
              type: "RESERVE",
              amount: priceUnits,
              from: wallet.address,
              to: custody,
              nonce,
              ref_kind: "order",
              ref_id: orderId,
              memo: "Reserva do valor contratado",
            }),
          ),
          key,
        ),
      ],
      () => wallets.nextNonce(wallet.address),
    );
    return { recorded: true };
  } catch (error) {
    return { recorded: false, reason: reasonOf(error) };
  }
}

/**
 * Anchors the delivered bytes and the verification report. Neither moves value: an anchor
 * records that a given content existed at a given point, and says nothing about its quality.
 */
export async function recordVerificationAnchors(
  orderId: string,
  supplierCompanyId: string,
  deliverySha256: string,
  report: unknown,
  deliveryVersion: number,
): Promise<BridgeResult> {
  const loaded = await modules();
  if (!loaded) return { recorded: false, reason: "layer_absent" };
  try {
    const { wallets, tx: txModule } = loaded;
    // The report is hashed in its canonical form so the anchor is reproducible by anyone who
    // reads the stored report and serialises it the same way the chain does.
    const { createHash } = await import("node:crypto");
    const reportSha256 = createHash("sha256")
      .update(txModule.canonicalize(report), "utf8")
      .digest("hex");
    const wallet = await wallets.ensureCompanyWallet(supplierCompanyId);
    const deliveryKey = `order:${orderId}:delivery:${deliveryVersion}`;
    const reportKey = `order:${orderId}:report:${deliveryVersion}`;
    await submitWithRetry(
      loaded,
      [deliveryKey, reportKey],
      async (nonce) => [
        withKey(
          await wallets.signAsCompany(
            supplierCompanyId,
            payload({
              type: "ANCHOR",
              from: wallet.address,
              nonce,
              payload_hash: deliverySha256,
              ref_kind: "delivery",
              ref_id: orderId,
              memo: `Entrega versão ${deliveryVersion}`,
            }),
          ),
          deliveryKey,
        ),
        withKey(
          await wallets.signAsCompany(
            supplierCompanyId,
            payload({
              type: "ANCHOR",
              from: wallet.address,
              nonce: nonce + 1,
              payload_hash: reportSha256,
              ref_kind: "report",
              ref_id: orderId,
              memo: `Relatório da versão ${deliveryVersion}`,
            }),
          ),
          reportKey,
        ),
      ],
      () => wallets.nextNonce(wallet.address),
    );
    return { recorded: true };
  } catch (error) {
    return { recorded: false, reason: reasonOf(error) };
  }
}

/**
 * Settlement transactions handed to `settle_verified_order_nmk`, which commits them in the
 * same database transaction as the payment. Returns null when the layer cannot sign, and the
 * caller then settles through the original function so the payment still happens.
 */
export async function settlementTransactions(
  orderId: string,
  supplierCompanyId: string,
  priceUnits: number,
  commissionBps: number,
): Promise<ChainTransaction[] | null> {
  const loaded = await modules();
  if (!loaded) return null;
  try {
    const { wallets } = loaded;
    const fee = Math.floor((priceUnits * commissionBps) / 10000);
    const payout = priceUnits - fee;
    const custody = await wallets.custodyAddress();
    const supplier = await wallets.ensureCompanyWallet(supplierCompanyId);
    const platform = await wallets.ensureCompanyWallet(PLATFORM_COMPANY_ID);
    let nonce = await wallets.nextNonce(custody);

    const transfers: ChainTransaction[] = [];
    if (payout > 0)
      transfers.push(
        withKey(
          await wallets.signAsCustody(
            payload({
              type: "TRANSFER",
              amount: payout,
              from: custody,
              to: supplier.address,
              nonce: nonce++,
              ref_kind: "order",
              ref_id: orderId,
              memo: "Repasse ao fornecedor",
            }),
          ),
          `order:${orderId}:settlement:transfer`,
        ),
      );
    if (fee > 0)
      transfers.push(
        withKey(
          await wallets.signAsCustody(
            payload({
              type: "FEE",
              amount: fee,
              from: custody,
              to: platform.address,
              nonce: nonce++,
              ref_kind: "order",
              ref_id: orderId,
              memo: "Taxa da plataforma",
            }),
          ),
          `order:${orderId}:settlement:fee`,
        ),
      );
    return transfers;
  } catch {
    return null;
  }
}

/** Release of the reserve back to the buyer, handed to `studio_cancel_order_nmk`. */
export async function releaseTransactions(
  orderId: string,
  buyerCompanyId: string,
  priceUnits: number,
): Promise<ChainTransaction[] | null> {
  const loaded = await modules();
  if (!loaded) return null;
  try {
    const { wallets } = loaded;
    const custody = await wallets.custodyAddress();
    const buyer = await wallets.ensureCompanyWallet(buyerCompanyId);
    return [
      withKey(
        await wallets.signAsCustody(
          payload({
            type: "RELEASE",
            amount: priceUnits,
            from: custody,
            to: buyer.address,
            nonce: await wallets.nextNonce(custody),
            ref_kind: "order",
            ref_id: orderId,
            memo: "Devolução da reserva",
          }),
        ),
        `order:${orderId}:release`,
      ),
    ];
  } catch {
    return null;
  }
}

function reasonOf(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/NMK_WALLET_SECRET/i.test(message)) return "wallet_secret_missing";
  if (NONCE_CONFLICT.test(message)) return "nonce_conflict";
  if (/relation .* does not exist|schema cache/i.test(message)) return "migration_pending";
  return "write_failed";
}
