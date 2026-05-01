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
      audit_events: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string | null
          project_id: string | null
          request_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          project_id?: string | null
          request_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          project_id?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      export_files: {
        Row: {
          bucket: string
          byte_size: number | null
          checksum: string | null
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          object_key: string
          project_id: string
          provider: string
        }
        Insert: {
          bucket: string
          byte_size?: number | null
          checksum?: string | null
          content_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          object_key: string
          project_id: string
          provider: string
        }
        Update: {
          bucket?: string
          byte_size?: number | null
          checksum?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          object_key?: string
          project_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          school_name: string | null
          teacher_name: string | null
          teaching_grade: string | null
          teaching_level: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          school_name?: string | null
          teacher_name?: string | null
          teaching_grade?: string | null
          teaching_level?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          school_name?: string | null
          teacher_name?: string | null
          teaching_grade?: string | null
          teaching_level?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          market: string
          metadata: Json
          organization_id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          market?: string
          metadata?: Json
          organization_id: string
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          market?: string
          metadata?: Json
          organization_id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_entries: {
        Row: {
          citation: string
          corpus_id: string
          created_at: string
          embedding: string | null
          external_id: string | null
          grade_bands: string[]
          id: string
          keywords: string[]
          module: string
          requirements: string[]
          section_path: string[]
          summary: string
          teaching_implications: string[]
          title: string
        }
        Insert: {
          citation: string
          corpus_id: string
          created_at?: string
          embedding?: string | null
          external_id?: string | null
          grade_bands?: string[]
          id?: string
          keywords?: string[]
          module: string
          requirements?: string[]
          section_path?: string[]
          summary: string
          teaching_implications?: string[]
          title: string
        }
        Update: {
          citation?: string
          corpus_id?: string
          created_at?: string
          embedding?: string | null
          external_id?: string | null
          grade_bands?: string[]
          id?: string
          keywords?: string[]
          module?: string
          requirements?: string[]
          section_path?: string[]
          summary?: string
          teaching_implications?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_entries_corpus_id_fkey"
            columns: ["corpus_id"]
            isOneToOne: false
            referencedRelation: "standards_corpora"
            referencedColumns: ["id"]
          },
        ]
      }
      standards_corpora: {
        Row: {
          availability: string
          created_at: string
          display_name: string
          id: string
          issuer: string
          market: string
          official_version: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          availability?: string
          created_at?: string
          display_name: string
          id?: string
          issuer: string
          market: string
          official_version: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string
          created_at?: string
          display_name?: string
          id?: string
          issuer?: string
          market?: string
          official_version?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation: {
        Args: { invitation_token: string }
        Returns: string
      }
      can_write_project: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      create_organization_invitation: {
        Args: {
          invitation_email: string
          invitation_role: Database["public"]["Enums"]["member_role"]
          invitation_token_hash: string
          target_organization_id: string
        }
        Returns: string
      }
      create_personal_workspace: {
        Args: { workspace_name?: string }
        Returns: string
      }
      is_org_admin: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      match_standard_entries: {
        Args: {
          match_limit?: number
          query_embedding: string
          similarity_threshold?: number
          target_market?: string
        }
        Returns: {
          availability: string
          citation: string
          corpus_id: string
          display_name: string
          grade_bands: string[]
          id: string
          issuer: string
          keywords: string[]
          module: string
          official_version: string
          requirements: string[]
          section_path: string[]
          similarity: number
          source_url: string
          summary: string
          teaching_implications: string[]
          title: string
        }[]
      }
      match_standard_entries_hybrid: {
        Args: {
          lexical_match_limit?: number
          match_limit?: number
          query_embedding: string
          query_text: string
          rrf_k?: number
          target_market?: string
          vector_match_limit?: number
        }
        Returns: {
          citation: string
          grade_bands: string[]
          id: string
          keywords: string[]
          module: string
          requirements: string[]
          section_path: string[]
          similarity: number
          summary: string
          teaching_implications: string[]
          title: string
        }[]
      }
      remove_organization_member: {
        Args: { target_organization_id: string; target_user_id: string }
        Returns: undefined
      }
      require_project_writer: {
        Args: { target_project_id: string }
        Returns: string
      }
      resend_organization_invitation: {
        Args: { next_token_hash: string; target_invitation_id: string }
        Returns: undefined
      }
      revoke_organization_invitation: {
        Args: { target_invitation_id: string }
        Returns: undefined
      }
      standard_entry_search_document: {
        Args: {
          citation: string
          grade_bands: string[]
          keywords: string[]
          module: string
          requirements: string[]
          section_path: string[]
          summary: string
          teaching_implications: string[]
          title: string
        }
        Returns: unknown
      }
      standard_entry_search_text: {
        Args: {
          citation: string
          grade_bands: string[]
          keywords: string[]
          module: string
          requirements: string[]
          section_path: string[]
          summary: string
          teaching_implications: string[]
          title: string
        }
        Returns: string
      }
      update_organization_member_role: {
        Args: {
          next_role: Database["public"]["Enums"]["member_role"]
          target_organization_id: string
          target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      audit_action:
        | "project.created"
        | "artifact.exported"
        | "generation.failed"
        | "organization.invitation_created"
        | "organization.invitation_revoked"
        | "organization.invitation_resent"
        | "organization.invitation_accepted"
        | "organization.member_role_updated"
        | "organization.member_removed"
      member_role: "owner" | "admin" | "teacher" | "viewer"
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
    Enums: {
      audit_action: [
        "project.created",
        "artifact.exported",
        "generation.failed",
        "organization.invitation_created",
        "organization.invitation_revoked",
        "organization.invitation_resent",
        "organization.invitation_accepted",
        "organization.member_role_updated",
        "organization.member_removed",
      ],
      member_role: ["owner", "admin", "teacher", "viewer"],
    },
  },
} as const
