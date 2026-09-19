import type { AgentOffer, Check } from "./a2a-contract";
export type StudioCompany = {
  id: string;
  name: string;
  description: string;
  operational: boolean;
  kind?: string;
  owner_user_id: string | null;
  visibility: "private" | "commercial";
};
export type StudioAccount = {
  company_id: string;
  available_units: number;
  reserved_units: number;
  paid_units: number;
  received_units: number;
};
export type StudioOrder = {
  id: string;
  title: string;
  status: string;
  buyer_company_id: string;
  supplier_company_id: string;
  current_delivery_version: number;
  budget_cap_units: number;
  selected_reason: string;
  created_at: string;
};
export type StudioDelivery = {
  id: string;
  order_id: string;
  version: number;
  file_name: string;
  media_type: string;
  sha256: string;
  artifact_content: string | null;
  test_upload: boolean;
  created_at: string;
};
export type StudioReport = {
  id: string;
  order_id: string;
  delivery_id: string;
  delivery_version: number;
  checks: Check[];
  decision: string;
  summary: string;
  rules_version: string;
  tool_name: string;
};
export type StudioEvent = {
  id: string;
  actor_label: string;
  event_type: string;
  result: string;
  created_at: string;
};
export type StudioDetails = {
  order: StudioOrder;
  contract: {
    id: string;
    order_id: string;
    offer_version_id: string;
    price_units: number;
    commission_bps: number;
    acceptance_criteria: { criterion: string; expected: string | boolean }[];
    deadline_at: string;
    revision_limit: number;
    requires_human_review: boolean;
  };
  deliveries: StudioDelivery[];
  reports: StudioReport[];
  events: StudioEvent[];
  humanReviews: {
    id: string;
    delivery_id: string;
    decision: string;
    note: string;
    reviewed_by: string;
    created_at: string;
  }[];
};
export type StudioWorkspace = {
  companies: StudioCompany[];
  agents: {
    id: string;
    company_id: string;
    name: string;
    agent_type: string;
    model: string;
    instructions: string;
    active: boolean;
  }[];
  accounts: StudioAccount[];
  orders: StudioOrder[];
  offers: AgentOffer[];
  ledger: {
    id: string;
    company_id: string;
    entry_type: string;
    amount_units: number;
    description: string;
    created_at: string;
  }[];
  credentials: {
    id: string;
    company_id: string;
    prefix: string;
    created_at: string;
    revoked_at: string | null;
  }[];
  privateRuns?: {
    id: string;
    company_id: string;
    sha256: string;
    report: { decision: string; summary: string };
    created_at: string;
  }[];
  inference?: {
    id: string;
    task_type: string;
    duration_ms: number;
    usage_data: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null;
    created_at: string;
  }[];
};
