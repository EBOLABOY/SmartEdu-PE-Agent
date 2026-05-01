import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import {
  listConversationMessagesFromS3,
  saveConversationMessagesToS3,
} from "@/lib/persistence/conversation-message-manifest";

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

    await saveConversationMessagesToS3({
      conversationId,
      messages: input.messages.map((message) => {
        const uiMessage = (message.metadata?.uiMessage ?? message) as SmartEduUIMessage;

        return {
          ...uiMessage,
          id: extractUiMessageId(message),
          role: message.role,
        };
      }),
      projectId: input.threadId,
      requestId: input.requestId,
    });
  }

  async listMessages(input: ListMessagesInput): Promise<MastraMessage[]> {
    const limit = input.limit ?? 30;
    const thread = await this.getThread(input.threadId);

    if (thread) {
      const s3Messages = await listConversationMessagesFromS3({
        conversationId: thread.id,
        limit,
        projectId: input.threadId,
      });

      if (s3Messages) {
        return s3Messages.map((message) => ({
          content: message.content,
          createdAt: message.createdAt,
          id: message.uiMessageId,
          metadata: {
            uiMessage: message.uiMessage,
            uiMessageId: message.uiMessageId,
          },
          role: message.role,
          threadId: input.threadId,
        }));
      }
    }

    return [];
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
