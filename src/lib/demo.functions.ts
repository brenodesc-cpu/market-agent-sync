import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error("Backend indisponível");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    }},
  });
}

export const getDemoWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicClient();
  const [companies, offers, versions, accounts, orders, contracts, deliveries, reports, events, integrations, ledger] = await Promise.all([
    db.from("companies").select("id,name,description,kind,operational").eq("is_demo", true).order("name"),
    db.from("offers").select("id,company_id,title,current_version,published").eq("published", true),
    db.from("offer_versions").select("id,offer_id,version,description,price_units,deadline_hours,acceptance_criteria,revision_limit,cancellation_policy,available"),
    db.from("accounts").select("company_id,available_units,reserved_units,paid_units,received_units,commission_units"),
    db.from("orders").select("id,buyer_company_id,supplier_company_id,offer_id,title,brief,budget_cap_units,status,selected_reason,current_delivery_version,revision_count,created_at").eq("is_demo", true).limit(1).single(),
    db.from("contracts").select("*").limit(1).single(),
    db.from("deliveries").select("id,order_id,version,file_name,byte_size,sha256,test_upload,supplier_message,created_at").order("version"),
    db.from("verification_reports").select("id,delivery_id,delivery_version,rules_version,tool_name,checks,decision,summary,created_at").order("delivery_version"),
    db.from("order_events").select("id,actor_label,event_type,result,created_at").order("created_at"),
    db.from("integrations").select("provider,status,last_checked_at,safe_message").order("provider"),
    db.from("ledger_entries").select("id,company_id,entry_type,amount_units,description,created_at").order("created_at"),
  ]);
  const errors = [companies, offers, versions, accounts, orders, contracts, deliveries, reports, events, integrations, ledger].map(x => x.error).filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message ?? "Falha ao carregar demonstração");
  return { companies: companies.data ?? [], offers: offers.data ?? [], versions: versions.data ?? [], accounts: accounts.data ?? [], order: orders.data, contract: contracts.data, deliveries: deliveries.data ?? [], reports: reports.data ?? [], events: events.data ?? [], integrations: integrations.data ?? [], ledger: ledger.data ?? [] };
});
