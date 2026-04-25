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
          content: string;
          content_type: "markdown" | "html";
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
          content: string;
          content_type: "markdown" | "html";
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
            | "generation.failed";
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
    };
    Views: Record<string, never>;
    Functions: {
      create_artifact_version: {
        Args: {
          artifact_content: string;
          artifact_content_type: "markdown" | "html";
          artifact_protocol_version: string;
          artifact_request_id?: string | null;
          artifact_stage: "lesson" | "html";
          artifact_status: "streaming" | "ready" | "error";
          artifact_title: string;
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
      restore_artifact_version: {
        Args: {
          restore_request_id?: string | null;
          target_project_id: string;
          target_version_id: string;
        };
        Returns: string;
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
        | "generation.failed";
      member_role: "owner" | "admin" | "teacher" | "viewer";
    };
    CompositeTypes: Record<string, never>;
  };
};
