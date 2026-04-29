import type { Json } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export type MastraThread = {
  id: string;
  resourceId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type MastraMessage = {
  id: string;
  threadId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type SaveMessagesInput = {
  threadId: string;
  resourceId: string;
  messages: MastraMessage[];
  requestId?: string;
};

export type CreateThreadInput = {
  threadId: string;
  resourceId: string;
  title?: string;
};

export type ListMessagesInput = {
  threadId: string;
  limit?: number;
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function extractUiMessageId(message: MastraMessage): string {
  if (
    message.metadata &&
    typeof message.metadata.uiMessageId === "string" &&
    message.metadata.uiMessageId.trim()
  ) {
    return message.metadata.uiMessageId;
  }

  return message.id;
}

export class SupabaseMastraStorageAdapter {
  private supabase: SmartEduSupabaseClient;

  constructor(supabase: SmartEduSupabaseClient) {
    this.supabase = supabase;
  }

  async createThread(input: CreateThreadInput): Promise<MastraThread> {
    const { data, error } = await this.supabase
      .from("conversations")
      .insert({
        created_by: input.resourceId,
        project_id: input.threadId,
        title: input.title ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`[MastraStorageAdapter] 创建 Thread 失败: ${error.message}`);
    }

    return {
      id: data.id,
      resourceId: input.resourceId,
      title: data.title ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      metadata: {
        projectId: input.threadId,
        conversationId: data.id,
      },
    };
  }

  async getThread(threadId: string): Promise<MastraThread | null> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("*")
      .eq("project_id", threadId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`[MastraStorageAdapter] 获取 Thread 失败: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      resourceId: data.created_by,
      title: data.title ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      metadata: {
        projectId: threadId,
        conversationId: data.id,
      },
    };
  }

  private async deactivateStaleMessages(projectId: string, nextUiMessageIds: string[]) {
    const { data, error } = await this.supabase
      .from("messages")
      .select("ui_message_id")
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (error) {
      throw new Error(`[MastraStorageAdapter] 查询活跃消息失败: ${error.message}`);
    }

    const nextIds = new Set(nextUiMessageIds);
    const staleMessageIds = ((data ?? []) as Array<{ ui_message_id: string }>)
      .map((row) => row.ui_message_id)
      .filter((uiMessageId) => !nextIds.has(uiMessageId));

    if (staleMessageIds.length === 0) {
      return;
    }

    const { error: deactivateError } = await this.supabase
      .from("messages")
      .update({ is_active: false })
      .eq("project_id", projectId)
      .in("ui_message_id", staleMessageIds);

    if (deactivateError) {
      throw new Error(`[MastraStorageAdapter] 失活旧消息失败: ${deactivateError.message}`);
    }
  }

  async saveMessages(input: SaveMessagesInput): Promise<void> {
    if (input.messages.length === 0) {
      return;
    }

    let conversationId: string;
    const existingThread = await this.getThread(input.threadId);

    if (existingThread) {
      conversationId = existingThread.id;
    } else {
      const newThread = await this.createThread({
        threadId: input.threadId,
        resourceId: input.resourceId,
      });
      conversationId = newThread.id;
    }

    const rows = input.messages.map((message) => ({
      content: message.content,
      conversation_id: conversationId,
      created_by: input.resourceId,
      is_active: true,
      project_id: input.threadId,
      request_id: input.requestId ?? null,
      role: message.role,
      ui_message: toJson(message.metadata?.uiMessage ?? message),
      ui_message_id: extractUiMessageId(message),
    }));

    const { error } = await this.supabase.from("messages").upsert(rows, {
      onConflict: "project_id,ui_message_id",
    });

    if (error) {
      throw new Error(`[MastraStorageAdapter] 保存消息失败: ${error.message}`);
    }

    await this.deactivateStaleMessages(
      input.threadId,
      input.messages.map(extractUiMessageId),
    );
  }

  async listMessages(input: ListMessagesInput): Promise<MastraMessage[]> {
    const limit = input.limit ?? 30;

    const { data, error } = await this.supabase
      .from("messages")
      .select("*")
      .eq("project_id", input.threadId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`[MastraStorageAdapter] 获取消息列表失败: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.reverse().map((row) => ({
      id: row.ui_message_id,
      threadId: row.project_id,
      role: row.role as MastraMessage["role"],
      content: row.content,
      createdAt: row.created_at,
      metadata: {
        uiMessageId: row.ui_message_id,
        requestId: row.request_id ?? undefined,
        uiMessage: row.ui_message,
      },
    }));
  }
}

export function createMastraStorageAdapter(
  supabase: SmartEduSupabaseClient | null,
): SupabaseMastraStorageAdapter | null {
  if (!supabase) {
    return null;
  }

  return new SupabaseMastraStorageAdapter(supabase);
}
