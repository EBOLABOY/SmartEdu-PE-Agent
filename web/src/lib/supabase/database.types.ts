export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      artifacts: {
        Row: {
          created_at: string;
          current_version_id: string | null;
          id: string;
          project_id: string;
          stage: "lesson" | "html";
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_version_id?: string | null;
          id?: string;
          project_id: string;
          stage: "lesson" | "html";
          title: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artifacts"]["Insert"]>;
        Relationships: [];
      };
      artifact_versions: {
        Row: {
          artifact_id: string;
          content_byte_size: number | null;
          content_checksum: string | null;
          content_storage_bucket: string | null;
          content_storage_object_key: string | null;
          content_storage_provider: "inline" | "cloudflare-r2";
          content: string;
          content_type: "html" | "lesson-json";
          created_at: string;
          created_by: string | null;
          id: string;
          project_id: string;
          protocol_version: string;
          source_message_id: string | null;
          stage: "lesson" | "html";
          status: "streaming" | "ready" | "error";
          version_number: number;
          warning_text: string | null;
          workflow_trace: Json;
        };
        Insert: {
          artifact_id: string;
          content_byte_size?: number | null;
          content_checksum?: string | null;
          content_storage_bucket?: string | null;
          content_storage_object_key?: string | null;
          content_storage_provider?: "inline" | "cloudflare-r2";
          content: string;
          content_type: "html" | "lesson-json";
          created_at?: string;
          created_by?: string | null;
          id?: string;
          project_id: string;
          protocol_version: string;
          source_message_id?: string | null;
          stage: "lesson" | "html";
          status?: "streaming" | "ready" | "error";
          version_number: number;
          warning_text?: string | null;
          workflow_trace?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["artifact_versions"]["Insert"]>;
        Relationships: [];
      };
      conversations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          project_id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          project_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          content: string;
          conversation_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          project_id: string;
          request_id: string | null;
          role: "system" | "user" | "assistant" | "tool";
          ui_message: Json;
          ui_message_id: string;
        };
        Insert: {
          content?: string;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          project_id: string;
          request_id?: string | null;
          role: Database["public"]["Tables"]["messages"]["Row"]["role"];
          ui_message?: Json;
          ui_message_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      audit_events: {
        Row: {
          action:
            | "project.created"
            | "message.created"
            | "artifact.version_created"
            | "artifact.exported"
            | "artifact.restored"
            | "generation.failed"
            | "organization.invitation_created"
            | "organization.invitation_revoked"
            | "organization.invitation_resent"
            | "organization.invitation_accepted"
            | "organization.member_role_updated"
            | "organization.member_removed";
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json;
          organization_id: string | null;
          project_id: string | null;
          request_id: string | null;
        };
        Insert: {
          action: Database["public"]["Tables"]["audit_events"]["Row"]["action"];
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
          project_id?: string | null;
          request_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Insert"]>;
        Relationships: [];
      };
      export_files: {
        Row: {
          artifact_version_id: string | null;
          bucket: string;
          byte_size: number | null;
          checksum: string | null;
          content_type: string;
          created_at: string;
          created_by: string | null;
          id: string;
          object_key: string;
          project_id: string;
          provider: "supabase-storage" | "cloudflare-r2";
        };
        Insert: {
          artifact_version_id?: string | null;
          bucket: string;
          byte_size?: number | null;
          checksum?: string | null;
          content_type: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          object_key: string;
          project_id: string;
          provider: "supabase-storage" | "cloudflare-r2";
        };
        Update: Partial<Database["public"]["Tables"]["export_files"]["Insert"]>;
        Relationships: [];
      };
      organization_members: {
        Row: {
          created_at: string;
          organization_id: string;
          role: "owner" | "admin" | "teacher" | "viewer";
          user_id: string;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          role?: "owner" | "admin" | "teacher" | "viewer";
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_members"]["Insert"]>;
        Relationships: [];
      };
      organization_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          role: "owner" | "admin" | "teacher" | "viewer";
          status: "pending" | "accepted" | "revoked" | "expired";
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          role?: "owner" | "admin" | "teacher" | "viewer";
          status?: "pending" | "accepted" | "revoked" | "expired";
          token_hash: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_invitations"]["Insert"]>;
        Relationships: [];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          slug: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          slug?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          archived_at: string | null;
          created_at: string;
          description: string | null;
          id: string;
          market: string;
          metadata: Json;
          organization_id: string;
          owner_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          market?: string;
          metadata?: Json;
          organization_id: string;
          owner_id: string;
          title: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      standard_entries: {
        Row: {
          citation: string;
          corpus_id: string;
          created_at: string;
          embedding: number[] | null;
          external_id: string | null;
          grade_bands: string[];
          id: string;
          keywords: string[];
          module: string;
          requirements: string[];
          section_path: string[];
          summary: string;
          teaching_implications: string[];
          title: string;
        };
        Insert: {
          citation: string;
          corpus_id: string;
          created_at?: string;
          embedding?: number[] | null;
          external_id?: string | null;
          grade_bands?: string[];
          id?: string;
          keywords?: string[];
          module: string;
          requirements?: string[];
          section_path?: string[];
          summary: string;
          teaching_implications?: string[];
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["standard_entries"]["Insert"]>;
        Relationships: [];
      };
      standards_corpora: {
        Row: {
          availability: "ready" | "planned";
          created_at: string;
          display_name: string;
          id: string;
          issuer: string;
          market: string;
          official_version: string;
          source_url: string | null;
          updated_at: string;
        };
        Insert: {
          availability?: "ready" | "planned";
          created_at?: string;
          display_name: string;
          id?: string;
          issuer: string;
          market: string;
          official_version: string;
          source_url?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["standards_corpora"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          school_name: string | null;
          teacher_name: string | null;
          teaching_grade: string | null;
          teaching_level: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          school_name?: string | null;
          teacher_name?: string | null;
          teaching_grade?: string | null;
          teaching_level?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_artifact_version: {
        Args: {
          artifact_content: string;
          artifact_content_byte_size?: number | null;
          artifact_content_checksum?: string | null;
          artifact_content_storage_bucket?: string | null;
          artifact_content_storage_object_key?: string | null;
          artifact_content_storage_provider?: string | null;
          artifact_content_type: "html" | "lesson-json";
          artifact_protocol_version: string;
          artifact_request_id?: string | null;
          artifact_stage: "lesson" | "html";
          artifact_status: "streaming" | "ready" | "error";
          artifact_title: string;
          artifact_version_id?: string | null;
          artifact_warning_text?: string | null;
          artifact_workflow_trace?: Json;
          target_project_id: string;
        };
        Returns: string;
      };
      create_personal_workspace: {
        Args: {
          workspace_name?: string;
        };
        Returns: string;
      };
      is_org_writer: {
        Args: {
          target_organization_id: string;
        };
        Returns: boolean;
      };
      is_project_writer: {
        Args: {
          target_project_id: string;
        };
        Returns: boolean;
      };
      require_project_writer: {
        Args: {
          target_project_id: string;
        };
        Returns: string;
      };
      can_insert_org_member: {
        Args: {
          inserted_role: "owner" | "admin" | "teacher" | "viewer";
          target_organization_id: string;
        };
        Returns: boolean;
      };
      accept_organization_invitation: {
        Args: {
          invitation_token: string;
        };
        Returns: string;
      };
      create_organization_invitation: {
        Args: {
          invitation_email: string;
          invitation_role: "owner" | "admin" | "teacher" | "viewer";
          invitation_token_hash: string;
          target_organization_id: string;
        };
        Returns: string;
      };
      match_standard_entries: {
        Args: {
          match_limit?: number;
          query_embedding: number[];
          similarity_threshold?: number;
          target_market?: string;
        };
        Returns: {
          citation: string;
          corpus_id: string;
          display_name: string;
          grade_bands: string[];
          id: string;
          issuer: string;
          keywords: string[];
          module: string;
          official_version: string;
          requirements: string[];
          section_path: string[];
          similarity: number;
          source_url: string | null;
          summary: string;
          teaching_implications: string[];
          title: string;
          availability: "ready" | "planned";
        }[];
      };
      match_standard_entries_hybrid: {
        Args: {
          lexical_match_limit?: number;
          match_limit?: number;
          query_embedding: number[];
          query_text: string;
          rrf_k?: number;
          target_market?: string;
          vector_match_limit?: number;
        };
        Returns: {
          citation: string;
          grade_bands: string[];
          id: string;
          keywords: string[];
          module: string;
          requirements: string[];
          section_path: string[];
          similarity: number;
          summary: string;
          teaching_implications: string[];
          title: string;
        }[];
      };
      restore_artifact_version: {
        Args: {
          restore_request_id?: string | null;
          target_project_id: string;
          target_version_id: string;
        };
        Returns: string;
      };
      remove_organization_member: {
        Args: {
          target_organization_id: string;
          target_user_id: string;
        };
        Returns: void;
      };
      resend_organization_invitation: {
        Args: {
          next_token_hash: string;
          target_invitation_id: string;
        };
        Returns: void;
      };
      revoke_organization_invitation: {
        Args: {
          target_invitation_id: string;
        };
        Returns: void;
      };
      update_organization_member_role: {
        Args: {
          next_role: "owner" | "admin" | "teacher" | "viewer";
          target_organization_id: string;
          target_user_id: string;
        };
        Returns: void;
      };
    };
    Enums: {
      artifact_stage: "lesson" | "html";
      artifact_status: "streaming" | "ready" | "error";
      audit_action:
        | "project.created"
        | "message.created"
        | "artifact.version_created"
        | "artifact.exported"
        | "artifact.restored"
        | "generation.failed"
        | "organization.invitation_created"
        | "organization.invitation_revoked"
        | "organization.invitation_resent"
        | "organization.invitation_accepted"
        | "organization.member_role_updated"
        | "organization.member_removed";
      member_role: "owner" | "admin" | "teacher" | "viewer";
    };
    CompositeTypes: Record<string, never>;
  };
};
