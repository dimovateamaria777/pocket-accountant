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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bank_connection_attempts: {
        Row: {
          bank_country: string
          bank_name: string
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          state: string
          user_id: string
        }
        Insert: {
          bank_country: string
          bank_name: string
          completed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          state: string
          user_id?: string
        }
        Update: {
          bank_country?: string
          bank_name?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_connections: {
        Row: {
          access_valid_until: string | null
          accounts: Json
          bank_country: string
          bank_name: string
          created_at: string
          id: string
          last_synced_at: string | null
          provider: string
          session_id: string
          user_id: string
        }
        Insert: {
          access_valid_until?: string | null
          accounts?: Json
          bank_country: string
          bank_name: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          session_id: string
          user_id?: string
        }
        Update: {
          access_valid_until?: string | null
          accounts?: Json
          bank_country?: string
          bank_name?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_sync_reviews: {
        Row: {
          bank_account_id: string
          bank_connection_id: string
          created_at: string
          id: string
          payload: Json
          reason: string
          resolved_at: string | null
          review_key: string
          status: string
          user_id: string
        }
        Insert: {
          bank_account_id: string
          bank_connection_id: string
          created_at?: string
          id?: string
          payload: Json
          reason: string
          resolved_at?: string | null
          review_key: string
          status?: string
          user_id: string
        }
        Update: {
          bank_account_id?: string
          bank_connection_id?: string
          created_at?: string
          id?: string
          payload?: Json
          reason?: string
          resolved_at?: string | null
          review_key?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_sync_reviews_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          pattern: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          pattern: string
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      import_previews: {
        Row: {
          created_at: string
          expires_at: string
          file_hash: string
          file_name: string
          id: string
          rows: Json
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          file_hash: string
          file_name: string
          id?: string
          rows: Json
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_hash?: string
          file_name?: string
          id?: string
          rows?: Json
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      infopay_credentials: {
        Row: {
          connection_id: string
          created_at: string
          credentials_ciphertext: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          credentials_ciphertext: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          credentials_ciphertext?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "infopay_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          kind: string
          merchant: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          kind: string
          merchant: string
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          kind?: string
          merchant?: string
          user_id?: string
        }
        Relationships: []
      }
      statements: {
        Row: {
          created_at: string
          file_hash: string | null
          file_name: string
          id: string
          source: string | null
          tx_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          file_hash?: string | null
          file_name: string
          id?: string
          source?: string | null
          tx_count?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          file_hash?: string | null
          file_name?: string
          id?: string
          source?: string | null
          tx_count?: number
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          bank_connection_id: string | null
          category: string
          created_at: string
          currency: string
          description: string
          external_id: string | null
          id: string
          kind: string
          merchant: string
          original_amount: number | null
          original_currency: string | null
          statement_id: string | null
          tx_date: string
          user_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          bank_connection_id?: string | null
          category?: string
          created_at?: string
          currency?: string
          description: string
          external_id?: string | null
          id?: string
          kind?: string
          merchant: string
          original_amount?: number | null
          original_currency?: string | null
          statement_id?: string | null
          tx_date: string
          user_id?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bank_connection_id?: string | null
          category?: string
          created_at?: string
          currency?: string
          description?: string
          external_id?: string | null
          id?: string
          kind?: string
          merchant?: string
          original_amount?: number | null
          original_currency?: string | null
          statement_id?: string | null
          tx_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_import_preview: {
        Args: { p_preview_id: string }
        Returns: undefined
      }
      commit_import_preview: {
        Args: { p_corrections: Json; p_preview_id: string }
        Returns: Json
      }
      resolve_bank_sync_review: {
        Args: { _action: string; _review_id: string }
        Returns: string
      }
      save_statement_import: {
        Args: {
          p_file_hash: string
          p_file_name: string
          p_rows: Json
          p_source: string
        }
        Returns: Json
      }
      tx_filtered: {
        Args: {
          p_category: string
          p_from: string
          p_hidden: string[]
          p_kinds: string[]
          p_merchant: string
          p_search: string
          p_to: string
        }
        Returns: {
          amount: number
          bank_account_id: string | null
          bank_connection_id: string | null
          category: string
          created_at: string
          currency: string
          description: string
          external_id: string | null
          id: string
          kind: string
          merchant: string
          original_amount: number | null
          original_currency: string | null
          statement_id: string | null
          tx_date: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tx_page: {
        Args: {
          p_category?: string
          p_dir?: string
          p_from?: string
          p_hidden?: string[]
          p_kinds?: string[]
          p_limit?: number
          p_merchant?: string
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_to?: string
        }
        Returns: Json
      }
      tx_summary: {
        Args: {
          p_category?: string
          p_from?: string
          p_hidden?: string[]
          p_kinds?: string[]
          p_merchant?: string
          p_search?: string
          p_to?: string
        }
        Returns: Json
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
    Enums: {},
  },
} as const
