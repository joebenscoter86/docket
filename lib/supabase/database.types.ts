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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accounting_connections: {
        Row: {
          access_token: string
          company_id: string
          company_name: string | null
          connected_at: string | null
          default_tax_code_id: string | null
          id: string
          org_id: string
          provider: string
          refresh_token: string
          token_expires_at: string
        }
        Insert: {
          access_token: string
          company_id: string
          company_name?: string | null
          connected_at?: string | null
          default_tax_code_id?: string | null
          id?: string
          org_id: string
          provider: string
          refresh_token: string
          token_expires_at: string
        }
        Update: {
          access_token?: string
          company_id?: string
          company_name?: string | null
          connected_at?: string | null
          default_tax_code_id?: string | null
          id?: string
          org_id?: string
          provider?: string
          refresh_token?: string
          token_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          corrected_at: string | null
          corrected_value: string | null
          field_name: string
          id: string
          invoice_id: string
          org_id: string
          original_value: string | null
        }
        Insert: {
          corrected_at?: string | null
          corrected_value?: string | null
          field_name: string
          id?: string
          invoice_id: string
          org_id: string
          original_value?: string | null
        }
        Update: {
          corrected_at?: string | null
          corrected_value?: string | null
          field_name?: string
          id?: string
          invoice_id?: string
          org_id?: string
          original_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corrections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_data: {
        Row: {
          confidence_score: string | null
          currency: string | null
          due_date: string | null
          extracted_at: string | null
          extraction_duration_ms: number | null
          id: string
          invoice_date: string | null
          invoice_id: string
          invoice_number: string | null
          model_version: string | null
          payment_terms: string | null
          raw_ai_response: Json | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          vendor_address: string | null
          vendor_name: string | null
          vendor_ref: string | null
        }
        Insert: {
          confidence_score?: string | null
          currency?: string | null
          due_date?: string | null
          extracted_at?: string | null
          extraction_duration_ms?: number | null
          id?: string
          invoice_date?: string | null
          invoice_id: string
          invoice_number?: string | null
          model_version?: string | null
          payment_terms?: string | null
          raw_ai_response?: Json | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          vendor_address?: string | null
          vendor_name?: string | null
          vendor_ref?: string | null
        }
        Update: {
          confidence_score?: string | null
          currency?: string | null
          due_date?: string | null
          extracted_at?: string | null
          extraction_duration_ms?: number | null
          id?: string
          invoice_date?: string | null
          invoice_id?: string
          invoice_number?: string | null
          model_version?: string | null
          payment_terms?: string | null
          raw_ai_response?: Json | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          vendor_address?: string | null
          vendor_name?: string | null
          vendor_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_data_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_line_items: {
        Row: {
          amount: number | null
          description: string | null
          extracted_data_id: string
          gl_account_id: string | null
          gl_suggestion_source: string | null
          id: string
          is_user_confirmed: boolean | null
          quantity: number | null
          sort_order: number | null
          suggested_gl_account_id: string | null
          tax_code_id: string | null
          unit_price: number | null
        }
        Insert: {
          amount?: number | null
          description?: string | null
          extracted_data_id: string
          gl_account_id?: string | null
          gl_suggestion_source?: string | null
          id?: string
          is_user_confirmed?: boolean | null
          quantity?: number | null
          sort_order?: number | null
          suggested_gl_account_id?: string | null
          tax_code_id?: string | null
          unit_price?: number | null
        }
        Update: {
          amount?: number | null
          description?: string | null
          extracted_data_id?: string
          gl_account_id?: string | null
          gl_suggestion_source?: string | null
          id?: string
          is_user_confirmed?: boolean | null
          quantity?: number | null
          sort_order?: number | null
          suggested_gl_account_id?: string | null
          tax_code_id?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_line_items_extracted_data_id_fkey"
            columns: ["extracted_data_id"]
            isOneToOne: false
            referencedRelation: "extracted_data"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_account_mappings: {
        Row: {
          created_at: string | null
          description_pattern: string
          gl_account_id: string
          id: string
          last_used_at: string | null
          org_id: string
          usage_count: number | null
          vendor_name: string
        }
        Insert: {
          created_at?: string | null
          description_pattern: string
          gl_account_id: string
          id?: string
          last_used_at?: string | null
          org_id: string
          usage_count?: number | null
          vendor_name: string
        }
        Update: {
          created_at?: string | null
          description_pattern?: string
          gl_account_id?: string
          id?: string
          last_used_at?: string | null
          org_id?: string
          usage_count?: number | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_account_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          error_message: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          file_type: string
          id: string
          org_id: string
          output_type: string
          payment_account_id: string | null
          payment_account_name: string | null
          retry_count: number | null
          status: string
          uploaded_at: string | null
          tax_treatment: string | null
          xero_bill_status: string | null
        }
        Insert: {
          error_message?: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          file_type: string
          id?: string
          org_id: string
          output_type?: string
          payment_account_id?: string | null
          payment_account_name?: string | null
          retry_count?: number | null
          status?: string
          tax_treatment?: string | null
          uploaded_at?: string | null
          xero_bill_status?: string | null
        }
        Update: {
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          file_type?: string
          id?: string
          org_id?: string
          output_type?: string
          payment_account_id?: string | null
          payment_account_name?: string | null
          retry_count?: number | null
          status?: string
          tax_treatment?: string | null
          uploaded_at?: string | null
          xero_bill_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          id: string
          org_id: string
          invited_email: string
          token: string
          role: string
          invited_by: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          invited_email: string
          token?: string
          role?: string
          invited_by: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          invited_email?: string
          token?: string
          role?: string
          invited_by?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          default_output_type: string
          default_payment_account_id: string | null
          default_payment_account_name: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string | null
          default_output_type?: string
          default_payment_account_id?: string | null
          default_payment_account_name?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string | null
          default_output_type?: string
          default_payment_account_id?: string | null
          default_payment_account_name?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          id: string
          invoice_id: string
          provider: string
          provider_bill_id: string | null
          provider_entity_type: string
          provider_response: Json | null
          request_payload: Json | null
          status: string
          synced_at: string | null
          transaction_type: string
        }
        Insert: {
          id?: string
          invoice_id: string
          provider: string
          provider_bill_id?: string | null
          provider_entity_type?: string
          provider_response?: Json | null
          request_payload?: Json | null
          status: string
          synced_at?: string | null
          transaction_type?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          provider?: string
          provider_bill_id?: string | null
          provider_entity_type?: string
          provider_response?: Json | null
          request_payload?: Json | null
          status?: string
          synced_at?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active_org_id: string | null
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string | null
          email: string
          id: string
          is_design_partner: boolean | null
          onboarding_completed: boolean | null
          stripe_customer_id: string | null
          subscription_status: string | null
          subscription_tier: string | null
          trial_ends_at: string | null
        }
        Insert: {
          active_org_id?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_design_partner?: boolean | null
          onboarding_completed?: boolean | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          active_org_id?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_design_partner?: boolean | null
          onboarding_completed?: boolean | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      invoice_counts_by_status: {
        Args: never
        Returns: {
          count: number
          status: string
        }[]
      }
      upsert_gl_mapping: {
        Args: {
          p_description_pattern: string
          p_gl_account_id: string
          p_org_id: string
          p_vendor_name: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
