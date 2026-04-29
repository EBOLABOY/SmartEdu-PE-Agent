/**
 * Mastra Storage 预适配层 — Supabase 桥接适配器
 *
 * 将 Mastra memory domain 的 Thread/Message 操作
 * 桥接到现有 Supabase conversations/messages 表。
 *
 * 核心映射：
 * - threadId  → projectId（一个"项目"即一个独立的课时计划生命周期）
 * - resourceId → userId（Supabase auth user ID）
 *
 * 阶段规划：
 * - Phase 6 Step 1（当前）: 只写不读 — saveMessages 写入现有表，listMessages 返回空数组
 * - Phase 6 Step 2（后续）: 启用自动上下文窗口管理 — 配置 getMessages 策略
 *
 * 设计约束：
 * 1. 不改变现有 DDL — 所有操作指向现有 conversations/messages 表
 * 2. 消息幂等性 — 通过 ui_message_id 的 upsert 保证重复写入安全
 * 3. metadata 预留 — 每条消息的 metadata 中存储 ui_message_id，为后续去重做准备
 */

import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";
import type { Json } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// 类型定义：对齐 Mastra memory domain 的 Thread/Message 接口
// ---------------------------------------------------------------------------

/**
 * Mastra Thread 在本项目中等价于 Supabase conversations 表的一行。
 * threadId 强制映射为 projectId。
 */
export type MastraThread = {
  id: string;
  resourceId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

/**
 * Mastra Message 在本项目中等价于 Supabase messages 表的一行。
 * 每条 message 额外携带 metadata，存储 ui_message_id 以保证幂等性。
 */
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

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

/**
 * 从 Mastra Message 中提取 ui_message_id。
 * 优先从 metadata.uiMessageId 获取，兜底使用 message.id。
 */
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

// ---------------------------------------------------------------------------
// SupabaseMastraStorageAdapter
// ---------------------------------------------------------------------------

export class SupabaseMastraStorageAdapter {
  private supabase: SmartEduSupabaseClient;

  constructor(supabase: SmartEduSupabaseClient) {
    this.supabase = supabase;
  }

  // -------------------------------------------------------------------------
  // Thread 操作 → conversations 表
  // -------------------------------------------------------------------------

  /**
   * 创建 Thread。
   * 映射到 conversations 表的 INSERT，threadId 作为 project_id。
   */
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

  /**
   * 获取 Thread。
   * 查询 conversations 表中该 project_id 的最新会话。
   */
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

  // -------------------------------------------------------------------------
  // Message 操作 → messages 表
  // -------------------------------------------------------------------------

  /**
   * 保存消息（Phase 6 Step 1: 只写不读模式的核心方法）。
   * 映射到 messages 表的 UPSERT，通过 project_id + ui_message_id 保证幂等。
   */
  async saveMessages(input: SaveMessagesInput): Promise<void> {
    if (input.messages.length === 0) {
      return;
    }

    // 先确保 conversation 存在
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

    // 构造 upsert 行
    const rows = input.messages.map((message) => ({
      content: message.content,
      conversation_id: conversationId,
      created_by: input.resourceId,
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
  }

  async listMessages(input: ListMessagesInput): Promise<MastraMessage[]> {
    const limit = input.limit ?? 30;

    const { data, error } = await this.supabase
      .from("messages")
      .select("*")
      .eq("project_id", input.threadId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`[MastraStorageAdapter] 获取消息列表失败: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 数据库是按倒序查询（获取最新 N 条），返回给 Agent 前需反转回正序（时间线顺序）
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

// ---------------------------------------------------------------------------
// 工厂函数
// ---------------------------------------------------------------------------

/**
 * 创建 Mastra Storage 适配器实例。
 * 若 Supabase 客户端不可用，返回 null（与现有持久化层的工厂模式保持一致）。
 */
export function createMastraStorageAdapter(
  supabase: SmartEduSupabaseClient | null,
): SupabaseMastraStorageAdapter | null {
  if (!supabase) {
    return null;
  }

  return new SupabaseMastraStorageAdapter(supabase);
}
