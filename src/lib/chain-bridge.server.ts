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

async function modules(): Promise<{ wallets: Wallets; node: Node; tx: Tx } | null> {
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

/**
 * Mirrors a company's existing credit balance onto the chain, exactly once.
 *
 * Companies hold credits before the chain exists, so without this the derived chain balance
 * would be zero and the first reserve would fail the no-negative-balance rule. The mint is
 * the chain acknowledging a balance the ledger already granted — it never creates value that
 * the ledger does not already show, and the stable idempotency key makes a repeat a no-op.
 */
export async function ensureBootstrapMint(companyId: string): Promise<BridgeResult> {
  const loaded = await modules();
  if (!loaded) return { recorded: false, reason: "layer_absent" };
  try {
    const { wallets, node } = loaded;
    const { runtimeDb } = await import("./studio-runtime.server");
    const db = await runtimeDb();
    const account = await db
      .from("accounts")
      .select("available_units,reserved_units")
      .eq("company_id", companyId)
      .maybeSingle();
    if (account.error || !account.data) return { recorded: false, reason: "no_account" };
    const total = Number(account.data.available_units) + Number(account.data.reserved_units);
    if (total <= 0) return { recorded: true };

    const wallet = await wallets.ensureCompanyWallet(companyId);
    const treasury = await wallets.treasuryAddress();
    const tx = await wallets.signAsTreasury(
      payload({
        type: "MINT",
        amount: total,
        to: wallet.address,
        nonce: await wallets.nextNonce(treasury),
        ref_kind: "treasury",
        ref_id: companyId,
        memo: "Espelho do saldo de créditos já concedido pelo ledger",
      }),
    );
    await node.submitSignedTransactions([withKey(tx, `company:${companyId}:bootstrap`)]);
    return { recorded: true };
  } catch (error) {
    return { recorded: false, reason: reasonOf(error) };
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
    const { wallets, node } = loaded;
    await ensureBootstrapMint(buyerCompanyId);
    const wallet = await wallets.ensureCompanyWallet(buyerCompanyId);
    const custody = await wallets.custodyAddress();
    const tx = await wallets.signAsCompany(
      buyerCompanyId,
      payload({
        type: "RESERVE",
        amount: priceUnits,
        from: wallet.address,
        to: custody,
        nonce: await wallets.nextNonce(wallet.address),
        ref_kind: "order",
        ref_id: orderId,
        memo: "Reserva do valor contratado",
      }),
    );
    await node.submitSignedTransactions([
      withKey(tx, `order:${orderId}:reservation`),
    ]);
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
    const { wallets, node, tx: txModule } = loaded;
    // The report is hashed in its canonical form so the anchor is reproducible by anyone who
    // reads the stored report and serialises it the same way the chain does.
    const { createHash } = await import("node:crypto");
    const reportSha256 = createHash("sha256")
      .update(txModule.canonicalize(report), "utf8")
      .digest("hex");
    const wallet = await wallets.ensureCompanyWallet(supplierCompanyId);
    let nonce = await wallets.nextNonce(wallet.address);
    const deliveryTx = await wallets.signAsCompany(
      supplierCompanyId,
      payload({
        type: "ANCHOR",
        from: wallet.address,
        nonce: nonce++,
        payload_hash: deliverySha256,
        ref_kind: "delivery",
        ref_id: orderId,
        memo: `Entrega versão ${deliveryVersion}`,
      }),
    );
    const reportTx = await wallets.signAsCompany(
      supplierCompanyId,
      payload({
        type: "ANCHOR",
        from: wallet.address,
        nonce: nonce++,
        payload_hash: reportSha256,
        ref_kind: "report",
        ref_id: orderId,
        memo: `Relatório da versão ${deliveryVersion}`,
      }),
    );
    await node.submitSignedTransactions([
      withKey(deliveryTx, `order:${orderId}:delivery:${deliveryVersion}`),
      withKey(reportTx, `order:${orderId}:report:${deliveryVersion}`),
    ]);
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
    const platform = await wallets.treasuryAddress();
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
              to: platform,
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

function withKey(tx: ChainTransaction, idempotencyKey: string): ChainTransaction {
  return { ...tx, idempotency_key: idempotencyKey };
}

function reasonOf(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /NMK_WALLET_SECRET/i.test(message)
    ? "wallet_secret_missing"
    : /relation .* does not exist|schema cache/i.test(message)
      ? "migration_pending"
      : "write_failed";
}
