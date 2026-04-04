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
          refresh_token_expires_at: string | null
          status: string
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
          refresh_token_expires_at?: string | null
          status?: string
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
          refresh_token_expires_at?: string | null
          status?: string
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
          user_id: string | null
        }
        Insert: {
          corrected_at?: string | null
          corrected_value?: string | null
          field_name: string
          id?: string
          invoice_id: string
          org_id: string
          original_value?: string | null
          user_id?: string | null
        }
        Update: {
          corrected_at?: string | null
          corrected_value?: string | null
          field_name?: string
          id?: string
          invoice_id?: string
          org_id?: string
          original_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corrections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_list_view"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "corrections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ingestion_log: {
        Row: {
          id: string
          message_id: string
          org_id: string
          processed_at: string | null
          rejection_reason: string | null
          sender: string | null
          status: string
          subject: string | null
          total_attachment_count: number | null
          valid_attachment_count: number | null
        }
        Insert: {
          id?: string
          message_id: string
          org_id: string
          processed_at?: string | null
          rejection_reason?: string | null
          sender?: string | null
          status: string
          subject?: string | null
          total_attachment_count?: number | null
          valid_attachment_count?: number | null
        }
        Update: {
          id?: string
          message_id?: string
          org_id?: string
          processed_at?: string | null
          rejection_reason?: string | null
          sender?: string | null
          status?: string
          subject?: string | null
          total_attachment_count?: number | null
          valid_attachment_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_ingestion_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          email_address: string
          email_type: string
          id: string
          metadata: Json | null
          resend_id: string | null
          sent_at: string | null
          status: string | null
          subject: string
          user_id: string | null
        }
        Insert: {
          email_address: string
          email_type: string
          id?: string
          metadata?: Json | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          user_id?: string | null
        }
        Update: {
          email_address?: string
          email_type?: string
          id?: string
          metadata?: Json | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_preferences: {
        Row: {
          billing_notifications: boolean | null
          created_at: string | null
          extraction_notifications: boolean | null
          id: string
          marketing_emails: boolean | null
          sync_notifications: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_notifications?: boolean | null
          created_at?: string | null
          extraction_notifications?: boolean | null
          id?: string
          marketing_emails?: boolean | null
          sync_notifications?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_notifications?: boolean | null
          created_at?: string | null
          extraction_notifications?: boolean | null
          id?: string
          marketing_emails?: boolean | null
          sync_notifications?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_data: {
        Row: {
          confidence_score: string | null
          currency: string | null
          due_date: string | null
          duplicate_matches: Json | null
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
          duplicate_matches?: Json | null
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
          duplicate_matches?: Json | null
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
            referencedRelation: "invoice_list_view"
            referencedColumns: ["id"]
          },
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
          tracking: Json | null
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
          tracking?: Json | null
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
          tracking?: Json | null
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
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          email_sender: string | null
          email_subject: string | null
          error_message: string | null
          file_hash: string | null
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
          sms_body_context: string | null
          source: string
          status: string
          tax_treatment: string | null
          uploaded_at: string | null
          uploaded_by: string | null
          xero_bill_status: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          email_sender?: string | null
          email_subject?: string | null
          error_message?: string | null
          file_hash?: string | null
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
          sms_body_context?: string | null
          source?: string
          status?: string
          tax_treatment?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          xero_bill_status?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          email_sender?: string | null
          email_subject?: string | null
          error_message?: string | null
          file_hash?: string | null
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
          sms_body_context?: string | null
          source?: string
          status?: string
          tax_treatment?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          xero_bill_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          source: string | null
          subscribed: boolean | null
          subscribed_at: string | null
          unsubscribed_at: string | null
          user_id: string | null
        }
        Insert: {
          email: string
          id?: string
          source?: string | null
          subscribed?: boolean | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string
          id?: string
          source?: string | null
          subscribed?: boolean | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          org_id: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          inbound_email_address: string | null
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string | null
          default_output_type?: string
          default_payment_account_id?: string | null
          default_payment_account_name?: string | null
          id?: string
          inbound_email_address?: string | null
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string | null
          default_output_type?: string
          default_payment_account_id?: string | null
          default_payment_account_name?: string | null
          id?: string
          inbound_email_address?: string | null
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
      sms_ingestion_log: {
        Row: {
          body_text: string | null
          created_at: string | null
          from_number: string
          id: string
          num_media: number | null
          org_id: string
          rejection_reason: string | null
          status: string
          total_attachment_count: number | null
          valid_attachment_count: number | null
        }
        Insert: {
          body_text?: string | null
          created_at?: string | null
          from_number: string
          id?: string
          num_media?: number | null
          org_id: string
          rejection_reason?: string | null
          status: string
          total_attachment_count?: number | null
          valid_attachment_count?: number | null
        }
        Update: {
          body_text?: string | null
          created_at?: string | null
          from_number?: string
          id?: string
          num_media?: number | null
          org_id?: string
          rejection_reason?: string | null
          status?: string
          total_attachment_count?: number | null
          valid_attachment_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_ingestion_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_verification_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          id: string
          phone_number: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          phone_number: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          phone_number?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_verification_codes_user_id_fkey"
            columns: ["user_id"]
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
          synced_by: string | null
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
          synced_by?: string | null
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
          synced_by?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_log_synced_by_fkey"
            columns: ["synced_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          full_name: string | null
          id: string
          is_design_partner: boolean | null
          onboarding_completed: boolean | null
          phone_number: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          subscription_tier: string | null
          trial_ends_at: string | null
          trial_invoices_used: number
        }
        Insert: {
          active_org_id?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_design_partner?: boolean | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          trial_ends_at?: string | null
          trial_invoices_used?: number
        }
        Update: {
          active_org_id?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_design_partner?: boolean | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          trial_ends_at?: string | null
          trial_invoices_used?: number
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
      invoice_list_view: {
        Row: {
          batch_id: string | null
          email_sender: string | null
          error_message: string | null
          file_name: string | null
          id: string | null
          invoice_date: string | null
          invoice_number: string | null
          org_id: string | null
          output_type: string | null
          sms_body_context: string | null
          source: string | null
          status: string | null
          total_amount: number | null
          uploaded_at: string | null
          vendor_name: string | null
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
    }
    Functions: {
      increment_trial_invoice: { Args: { p_user_id: string }; Returns: number }
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
A new version of Supabase CLI is available: v2.84.2 (currently installed v2.78.1)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
