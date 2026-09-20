import { createHash, randomBytes } from "node:crypto";
import { runtimeDb, rpc, orderDetails, ownedCompany } from "./studio-runtime.server.ts";
import {
  browserPurchaseSchema,
  browserQuote,
  BROWSER_OFFER,
  browserEvidenceSchema,
} from "./browser-qa.ts";
import { auditBrowserEvidence } from "./browser-audit.server.ts";

export async function browserSetup(userId: string) {
  const companyId = (await rpc("browser_buyer", { _user: userId })) as string;
  const db = await runtimeDb();
  const [worker, account, orders] = await Promise.all([
    db
      .from("browser_workers")
      .select("last_seen_at,expires_at")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("accounts")
      .select("available_units,reserved_units,paid_units")
      .eq("company_id", companyId)
      .single(),
    db
      .from("orders")
      .select("id,title,status,created_at")
      .eq("buyer_company_id", companyId)
      .eq("brief->>capability", "browser.qa.v1")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  for (const r of [worker, account, orders]) if (r.error) throw new Error(r.error.message);
  return {
    companyId,
    account: account.data,
    orders: orders.data ?? [],
    workerOnline: Boolean(
      worker.data?.last_seen_at &&
      Date.now() - Date.parse(worker.data.last_seen_at) < 20000 &&
      Date.parse(worker.data.expires_at) > Date.now(),
    ),
  };
}
export async function browserWorkerKey(userId: string) {
  const key = `nmw_${randomBytes(32).toString("hex")}`;
  const db = await runtimeDb();
  const result = await db
    .from("browser_workers")
    .upsert({
      user_id: userId,
      token_hash: createHash("sha256").update(key).digest("hex"),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      last_seen_at: null,
    });
  if (result.error) throw new Error(result.error.message);
  return { key, expiresInHours: 24 };
}
export async function purchaseBrowserTest(userId: string, companyId: string, raw: unknown) {
  const input = browserPurchaseSchema.parse(raw);
  await ownedCompany(userId, companyId);
  const quote = browserQuote(input.budget);
  if (!quote.selectedOffer) throw new Error(quote.reason);
  return rpc("studio_place_browser_order", {
    _user: userId,
    _payload: {
      ...input,
      buyerCompanyId: companyId,
      offerVersionId: BROWSER_OFFER,
      title: "Testar formulário em desktop e mobile",
      task: "Abrir a página de demonstração e enviar o formulário em desktop e mobile.",
      selectionReason: quote.reason,
      humanReview: true,
      autoCorrect: false,
    },
  });
}
export async function browserWorkerActor(request: Request) {
  const key = /^Bearer (nmw_[a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!key) throw new Error("invalid_worker");
  const db = await runtimeDb();
  const result = await db
    .from("browser_workers")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", createHash("sha256").update(key).digest("hex"))
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (result.error || !result.data) throw new Error("invalid_worker");
  return result.data.user_id as string;
}
export async function nextBrowserJob(userId: string) {
  const db = await runtimeDb();
  const companies = await db.from("companies").select("id").eq("owner_user_id", userId);
  if (companies.error) throw new Error(companies.error.message);
  if (!companies.data?.length) return null;
  const orders = await db
    .from("orders")
    .select("id,current_delivery_version,brief")
    .in(
      "buyer_company_id",
      companies.data.map((c) => c.id),
    )
    .eq("brief->>capability", "browser.qa.v1")
    .in("status", ["contracted", "in_progress"])
    .order("created_at")
    .limit(10);
  if (orders.error) throw new Error(orders.error.message);
  for (const order of orders.data ?? []) {
    try {
      const job = await rpc("studio_claim_execution", { _user: userId, _order: order.id });
      if (job.status === "claimed")
        return {
          orderId: order.id,
          token: job.token,
          version: job.version,
          fixture: "lead-form-v1",
          omitMobile: Boolean(job.input.testFailure && job.version === 1),
        };
    } catch (error) {
      if (!String(error).includes("deadline_expired")) throw error;
    }
  }
  return null;
}
export async function receiveBrowserEvidence(userId: string, raw: unknown) {
  const evidence = browserEvidenceSchema.parse(raw);
  const detail = await orderDetails(userId, evidence.orderId);
  await ownedCompany(userId, detail.order.buyer_company_id);
  const report = auditBrowserEvidence(evidence, evidence.orderId, evidence.token);
  return rpc("studio_record_browser_delivery", {
    _order: evidence.orderId,
    _token: evidence.token,
    _content: JSON.stringify(evidence),
    _report: report,
  });
}
export async function retryBrowserTest(userId: string, orderId: string) {
  const detail = await orderDetails(userId, orderId);
  await ownedCompany(userId, detail.order.buyer_company_id);
  const db = await runtimeDb();
  // Only the rejected first version can request the contracted correction.
  const r = await db
    .from("orders")
    .update({ status: "contracted" })
    .eq("id", orderId)
    .eq("brief->>capability", "browser.qa.v1")
    .eq("status", "revision_requested")
    .eq("current_delivery_version", 1);
  if (r.error) throw new Error(r.error.message);
  return orderDetails(userId, orderId);
}
