export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      a2a_requests: {
        Row: {
          payload_hash: string
          purpose: string
          request_id: string
          result: Json
          user_id: string
        }
        Insert: {
          payload_hash: string
          purpose: string
          request_id: string
          result: Json
          user_id: string
        }
        Update: {
          payload_hash?: string
          purpose?: string
          request_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          available_units: number
          commission_units: number
          company_id: string
          id: string
          paid_units: number
          received_units: number
          reserved_units: number
          updated_at: string
        }
        Insert: {
          available_units?: number
          commission_units?: number
          company_id: string
          id?: string
          paid_units?: number
          received_units?: number
          reserved_units?: number
          updated_at?: string
        }
        Update: {
          available_units?: number
          commission_units?: number
          company_id?: string
          id?: string
          paid_units?: number
          received_units?: number
          reserved_units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_credentials: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          prefix: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          prefix: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          prefix?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_credentials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          active: boolean
          agent_type: string
          company_id: string
          created_at: string
          id: string
          instructions: string
          model: string
          name: string
        }
        Insert: {
          active?: boolean
          agent_type: string
          company_id: string
          created_at?: string
          id?: string
          instructions: string
          model: string
          name: string
        }
        Update: {
          active?: boolean
          agent_type?: string
          company_id?: string
          created_at?: string
          id?: string
          instructions?: string
          model?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string
          executor_type: string
          id: string
          integration_status: Database["public"]["Enums"]["integration_status"]
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description: string
          executor_type: string
          id?: string
          integration_status?: Database["public"]["Enums"]["integration_status"]
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string
          executor_type?: string
          id?: string
          integration_status?: Database["public"]["Enums"]["integration_status"]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          description: string
          id: string
          is_demo: boolean
          kind: string
          name: string
          operational: boolean
          owner_user_id: string | null
          slug: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_demo?: boolean
          kind: string
          name: string
          operational?: boolean
          owner_user_id?: string | null
          slug: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_demo?: boolean
          kind?: string
          name?: string
          operational?: boolean
          owner_user_id?: string | null
          slug?: string
          visibility?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          acceptance_criteria: Json
          buyer_company_id: string
          cancellation_policy: string
          commission_bps: number
          created_at: string
          deadline_at: string
          id: string
          offer_version_id: string
          order_data: Json
          order_id: string
          price_units: number
          requires_human_review: boolean
          revision_limit: number
          supplier_company_id: string
        }
        Insert: {
          acceptance_criteria: Json
          buyer_company_id: string
          cancellation_policy: string
          commission_bps?: number
          created_at?: string
          deadline_at: string
          id?: string
          offer_version_id: string
          order_data: Json
          order_id: string
          price_units: number
          requires_human_review?: boolean
          revision_limit: number
          supplier_company_id: string
        }
        Update: {
          acceptance_criteria?: Json
          buyer_company_id?: string
          cancellation_policy?: string
          commission_bps?: number
          created_at?: string
          deadline_at?: string
          id?: string
          offer_version_id?: string
          order_data?: Json
          order_id?: string
          price_units?: number
          requires_human_review?: boolean
          revision_limit?: number
          supplier_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_offer_version_id_fkey"
            columns: ["offer_version_id"]
            isOneToOne: false
            referencedRelation: "offer_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          artifact_content: string | null
          byte_size: number
          created_at: string
          file_name: string
          id: string
          media_type: string
          order_id: string
          sha256: string | null
          storage_path: string
          submitted_by_company_id: string
          supplier_message: string | null
          test_upload: boolean
          version: number
        }
        Insert: {
          artifact_content?: string | null
          byte_size: number
          created_at?: string
          file_name: string
          id?: string
          media_type: string
          order_id: string
          sha256?: string | null
          storage_path: string
          submitted_by_company_id: string
          supplier_message?: string | null
          test_upload?: boolean
          version: number
        }
        Update: {
          artifact_content?: string | null
          byte_size?: number
          created_at?: string
          file_name?: string
          id?: string
          media_type?: string
          order_id?: string
          sha256?: string | null
          storage_path?: string
          submitted_by_company_id?: string
          supplier_message?: string | null
          test_upload?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_submitted_by_company_id_fkey"
            columns: ["submitted_by_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      human_reviews: {
        Row: {
          created_at: string
          decision: string
          delivery_id: string
          id: string
          note: string
          order_id: string
          report_id: string
          reviewed_by: string
          sha256: string
        }
        Insert: {
          created_at?: string
          decision: string
          delivery_id: string
          id?: string
          note: string
          order_id: string
          report_id: string
          reviewed_by: string
          sha256: string
        }
        Update: {
          created_at?: string
          decision?: string
          delivery_id?: string
          id?: string
          note?: string
          order_id?: string
          report_id?: string
          reviewed_by?: string
          sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_reviews_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_reviews_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "verification_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      inference_runs: {
        Row: {
          company_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          model_requested: string
          order_id: string | null
          status: string
          task_type: string
          usage_data: Json | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model_requested: string
          order_id?: string | null
          status: string
          task_type: string
          usage_data?: Json | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model_requested?: string
          order_id?: string | null
          status?: string
          task_type?: string
          usage_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "inference_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inference_runs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          company_id: string | null
          id: string
          last_checked_at: string | null
          provider: string
          safe_message: string
          status: Database["public"]["Enums"]["integration_status"]
        }
        Insert: {
          company_id?: string | null
          id?: string
          last_checked_at?: string | null
          provider: string
          safe_message: string
          status?: Database["public"]["Enums"]["integration_status"]
        }
        Update: {
          company_id?: string | null
          id?: string
          last_checked_at?: string | null
          provider?: string
          safe_message?: string
          status?: Database["public"]["Enums"]["integration_status"]
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          external_job_id: string | null
          id: string
          idempotency_key: string
          kind: string
          lease_token: string | null
          lease_until: string | null
          order_id: string
          provider: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          external_job_id?: string | null
          id?: string
          idempotency_key: string
          kind: string
          lease_token?: string | null
          lease_until?: string | null
          order_id: string
          provider: string
          started_at?: string | null
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          external_job_id?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          lease_token?: string | null
          lease_until?: string | null
          order_id?: string
          provider?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_units: number
          company_id: string
          created_at: string
          description: string
          entry_type: string
          id: string
          idempotency_key: string
          order_id: string | null
        }
        Insert: {
          amount_units: number
          company_id: string
          created_at?: string
          description: string
          entry_type: string
          id?: string
          idempotency_key: string
          order_id?: string | null
        }
        Update: {
          amount_units?: number
          company_id?: string
          created_at?: string
          description?: string
          entry_type?: string
          id?: string
          idempotency_key?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_versions: {
        Row: {
          acceptance_criteria: Json
          available: boolean
          cancellation_policy: string
          created_at: string
          deadline_hours: number
          description: string
          id: string
          offer_id: string
          output_format: Json
          price_units: number
          required_inputs: Json
          revision_limit: number
          version: number
        }
        Insert: {
          acceptance_criteria: Json
          available?: boolean
          cancellation_policy: string
          created_at?: string
          deadline_hours: number
          description: string
          id?: string
          offer_id: string
          output_format?: Json
          price_units: number
          required_inputs?: Json
          revision_limit?: number
          version: number
        }
        Update: {
          acceptance_criteria?: Json
          available?: boolean
          cancellation_policy?: string
          created_at?: string
          deadline_hours?: number
          description?: string
          id?: string
          offer_id?: string
          output_format?: Json
          price_units?: number
          required_inputs?: Json
          revision_limit?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_versions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          capability_id: string
          company_id: string
          created_at: string
          current_version: number
          id: string
          published: boolean
          title: string
        }
        Insert: {
          capability_id: string
          company_id: string
          created_at?: string
          current_version?: number
          id?: string
          published?: boolean
          title: string
        }
        Update: {
          capability_id?: string
          company_id?: string
          created_at?: string
          current_version?: number
          id?: string
          published?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_label: string
          actor_type: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          order_id: string
          result: string
        }
        Insert: {
          actor_label: string
          actor_type: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          order_id: string
          result: string
        }
        Update: {
          actor_label?: string
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          order_id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          brief: Json
          budget_cap_units: number
          buyer_company_id: string
          created_at: string
          current_delivery_version: number
          id: string
          is_demo: boolean
          offer_id: string | null
          revision_count: number
          selected_reason: string | null
          status: Database["public"]["Enums"]["order_status"]
          supplier_company_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          brief?: Json
          budget_cap_units: number
          buyer_company_id: string
          created_at?: string
          current_delivery_version?: number
          id?: string
          is_demo?: boolean
          offer_id?: string | null
          revision_count?: number
          selected_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          supplier_company_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          brief?: Json
          budget_cap_units?: number
          buyer_company_id?: string
          created_at?: string
          current_delivery_version?: number
          id?: string
          is_demo?: boolean
          offer_id?: string | null
          revision_count?: number
          selected_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          supplier_company_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      private_runs: {
        Row: {
          artifact_content: string
          company_id: string
          created_at: string
          duration_ms: number
          id: string
          input_hash: string
          report: Json
          request_id: string
          requested_by: string
          sha256: string
        }
        Insert: {
          artifact_content: string
          company_id: string
          created_at?: string
          duration_ms: number
          id?: string
          input_hash: string
          report: Json
          request_id: string
          requested_by: string
          sha256: string
        }
        Update: {
          artifact_content?: string
          company_id?: string
          created_at?: string
          duration_ms?: number
          id?: string
          input_hash?: string
          report?: Json
          request_id?: string
          requested_by?: string
          sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_reports: {
        Row: {
          checks: Json
          created_at: string
          decision: Database["public"]["Enums"]["verification_decision"]
          delivery_id: string
          delivery_version: number
          id: string
          order_id: string
          rules_version: string
          summary: string
          tool_name: string
          verified_by_user_id: string | null
        }
        Insert: {
          checks: Json
          created_at?: string
          decision: Database["public"]["Enums"]["verification_decision"]
          delivery_id: string
          delivery_version: number
          id?: string
          order_id: string
          rules_version: string
          summary: string
          tool_name: string
          verified_by_user_id?: string | null
        }
        Update: {
          checks?: Json
          created_at?: string
          decision?: Database["public"]["Enums"]["verification_decision"]
          delivery_id?: string
          delivery_version?: number
          id?: string
          order_id?: string
          rules_version?: string
          summary?: string
          tool_name?: string
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_reports_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      catalogue_acceptance_criteria: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["company_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      reserve_demo_order: {
        Args: {
          _idempotency_key: string
          _offer_version_id: string
          _order_id: string
        }
        Returns: Json
      }
      settle_verified_order: {
        Args: { _idempotency_key: string; _order_id: string }
        Returns: Json
      }
      studio_add_clarification: {
        Args: { _note: string; _order: string; _user: string; _version: number }
        Returns: Json
      }
      studio_cancel_order: {
        Args: { _order: string; _user: string }
        Returns: Json
      }
      studio_claim_execution: {
        Args: { _order: string; _user: string }
        Returns: Json
      }
      studio_create_company: {
        Args: { _config: Json; _request: string; _user: string }
        Returns: Json
      }
      studio_place_order: {
        Args: { _payload: Json; _user: string }
        Returns: Json
      }
      studio_record_delivery: {
        Args: {
          _content: string
          _order: string
          _report: Json
          _token: string
        }
        Returns: Json
      }
      studio_review_delivery: {
        Args: {
          _decision: string
          _delivery: string
          _note: string
          _order: string
          _report: string
          _sha: string
          _user: string
        }
        Returns: Json
      }
      studio_set_commercial: {
        Args: { _company: string; _enabled: boolean; _user: string }
        Returns: Json
      }
    }
    Enums: {
      company_role: "owner" | "buyer" | "supplier" | "verifier" | "finance"
      integration_status: "connected" | "pending" | "error"
      order_status:
        | "draft"
        | "contracted"
        | "in_progress"
        | "delivered"
        | "verifying"
        | "revision_requested"
        | "verification_inconclusive"
        | "accepted"
        | "settled"
        | "cancelled"
        | "expired"
      verification_decision: "approved" | "rejected" | "inconclusive" | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      company_role: ["owner", "buyer", "supplier", "verifier", "finance"],
      integration_status: ["connected", "pending", "error"],
      order_status: [
        "draft",
        "contracted",
        "in_progress",
        "delivered",
        "verifying",
        "revision_requested",
        "verification_inconclusive",
        "accepted",
        "settled",
        "cancelled",
        "expired",
      ],
      verification_decision: ["approved", "rejected", "inconclusive", "error"],
    },
  },
} as const
