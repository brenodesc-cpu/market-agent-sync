import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildReviewEvidence } from "./review-evidence";

export async function loadReviewEvidence(db: SupabaseClient<Database>, orderId: string) {
  const order = await db
    .from("orders")
    .select("id,status,current_delivery_version")
    .eq("id", orderId)
    .maybeSingle();
  if (order.error || !order.data) throw new Error("Pedido indisponível para este usuário.");
  const [delivery, report, contract] = await Promise.all([
    db
      .from("deliveries")
      .select("id,order_id,version,sha256,file_name,test_upload")
      .eq("order_id", orderId)
      .eq("version", order.data.current_delivery_version)
      .maybeSingle(),
    db
      .from("verification_reports")
      .select(
        "id,order_id,delivery_id,delivery_version,rules_version,tool_name,decision,summary,checks",
      )
      .eq("order_id", orderId)
      .eq("delivery_version", order.data.current_delivery_version)
      .maybeSingle(),
    db
      .from("contracts")
      .select("id,order_id,acceptance_criteria,price_units")
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);
  if (delivery.error || report.error || contract.error)
    throw new Error("Não foi possível carregar as evidências.");
  return buildReviewEvidence({
    order: order.data,
    delivery: delivery.data,
    report: report.data,
    contract: contract.data,
  });
}

// Only used after validating the signed Agora session. Membership is checked
// again on every request because the user's access may have been revoked.
export async function loadScopedVoiceReview(orderId: string, userId: string, reportId?: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const order = await db
    .from("orders")
    .select("id,is_demo,buyer_company_id,supplier_company_id")
    .eq("id", orderId)
    .maybeSingle();
  if (order.error || !order.data) throw new Error("Pedido indisponível.");
  if (!order.data.is_demo) {
    const [buyer, supplier, verifier] = await Promise.all([
      db.rpc("is_company_member", { _company_id: order.data.buyer_company_id, _user_id: userId }),
      order.data.supplier_company_id
        ? db.rpc("is_company_member", {
            _company_id: order.data.supplier_company_id,
            _user_id: userId,
          })
        : Promise.resolve({ data: false, error: null }),
      db.rpc("has_role", { _user_id: userId, _role: "verifier" }),
    ]);
    if (
      buyer.error ||
      supplier.error ||
      verifier.error ||
      !(buyer.data || supplier.data || verifier.data)
    )
      throw new Error("Acesso negado.");
  }
  const evidence = await loadReviewEvidence(db, orderId);
  if (!reportId || evidence.report?.id !== reportId)
    throw new Error("A revisão mudou. Inicie outra sessão.");
  return evidence;
}
