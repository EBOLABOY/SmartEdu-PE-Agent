import { describe, expect, it, vi } from "vitest";

import {
  SupabaseMastraStorageAdapter,
  createMastraStorageAdapter,
  type MastraMessage,
} from "./mastra-storage-adapter";

// ---------------------------------------------------------------------------
// extractUiMessageId 无法直接导入（非导出），通过构造行为间接验证
// ---------------------------------------------------------------------------

function buildTestMessage(overrides: Partial<MastraMessage> = {}): MastraMessage {
  return {
    id: "msg-001",
    threadId: "project-aaa",
    role: "user",
    content: "三年级篮球运球",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMastraStorageAdapter 工厂函数
// ---------------------------------------------------------------------------

describe("createMastraStorageAdapter", () => {
  it("Supabase 客户端为 null 时返回 null", () => {
    expect(createMastraStorageAdapter(null)).toBeNull();
  });

  it("Supabase 客户端存在时返回适配器实例", () => {
    const mockSupabase = {} as never;
    const adapter = createMastraStorageAdapter(mockSupabase);
    expect(adapter).toBeInstanceOf(SupabaseMastraStorageAdapter);
  });
});

// ---------------------------------------------------------------------------
// listMessages — 历史查询与映射
// ---------------------------------------------------------------------------

describe("SupabaseMastraStorageAdapter.listMessages", () => {
  it("没有数据时返回空数组", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      })),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const result = await adapter.listMessages({ threadId: "project-aaa" });

    expect(result).toEqual([]);
  });

  it("查询包含指定 order 并将结果反转为正序", async () => {
    const dbRows = [
      {
        ui_message_id: "msg-002",
        project_id: "project-aaa",
        role: "assistant",
        content: "这是第二条",
        created_at: "2026-04-28T10:05:00Z",
        request_id: "req-002",
        ui_message: { foo: "bar" },
      },
      {
        ui_message_id: "msg-001",
        project_id: "project-aaa",
        role: "user",
        content: "这是第一条",
        created_at: "2026-04-28T10:00:00Z",
        request_id: "req-001",
        ui_message: '{"type":"stringified"}',
      },
    ];

    const limitFn = vi.fn().mockResolvedValue({ data: dbRows, error: null });
    const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
    const eqFn = vi.fn().mockReturnValue({ order: orderFn });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: eqFn,
        }),
      })),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const result = await adapter.listMessages({ threadId: "project-aaa", limit: 10 });

    expect(eqFn).toHaveBeenCalledWith("project_id", "project-aaa");
    expect(orderFn).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limitFn).toHaveBeenCalledWith(10);

    expect(result).toHaveLength(2);
    // 验证反转：原本 dbRows[0] 是 msg-002，返回的第一条应该是 msg-001
    expect(result[0].id).toBe("msg-001");
    expect(result[0].role).toBe("user");
    expect(result[0].metadata?.uiMessageId).toBe("msg-001");
    expect(result[0].metadata?.uiMessage).toBe('{"type":"stringified"}');

    expect(result[1].id).toBe("msg-002");
    expect(result[1].content).toBe("这是第二条");
    expect(result[1].metadata?.uiMessage).toEqual({ foo: "bar" });
  });
});

// ---------------------------------------------------------------------------
// saveMessages — upsert 行构造
// ---------------------------------------------------------------------------

describe("SupabaseMastraStorageAdapter.saveMessages", () => {
  it("空消息数组时不触发数据库操作", async () => {
    const mockSupabase = {} as never;
    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);

    // 不应抛错
    await expect(
      adapter.saveMessages({
        threadId: "project-aaa",
        resourceId: "user-001",
        messages: [],
      }),
    ).resolves.toBeUndefined();
  });

  it("消息写入时调用 conversations 查询和 messages upsert", async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const conversationSelectResult = {
      data: {
        id: "conv-001",
        created_by: "user-001",
        title: null,
        created_at: "2026-04-28T00:00:00Z",
        updated_at: "2026-04-28T00:00:00Z",
      },
      error: null,
    };

    // 构造 Supabase mock 链式调用
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve(conversationSelectResult),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "messages") {
          return {
            upsert: upsertFn,
          };
        }

        return {};
      }),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await adapter.saveMessages({
      threadId: "project-aaa",
      resourceId: "user-001",
      requestId: "req-001",
      messages: [
        buildTestMessage({
          id: "msg-001",
          metadata: { uiMessageId: "ui-msg-001" },
        }),
      ],
    });

    // 验证 upsert 被调用，且包含正确的 onConflict 策略
    expect(upsertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          project_id: "project-aaa",
          ui_message_id: "ui-msg-001",
          conversation_id: "conv-001",
          created_by: "user-001",
          request_id: "req-001",
          role: "user",
        }),
      ]),
      { onConflict: "project_id,ui_message_id" },
    );

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// createThread — conversations 表 INSERT
// ---------------------------------------------------------------------------

describe("SupabaseMastraStorageAdapter.createThread", () => {
  it("创建 Thread 时将 threadId 映射为 project_id", async () => {
    const insertedRow = {
      id: "conv-new-001",
      created_by: "user-001",
      project_id: "project-bbb",
      title: "三年级篮球",
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
    };

    const insertFn = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: insertedRow, error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn(() => ({
        insert: insertFn,
      })),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const thread = await adapter.createThread({
      threadId: "project-bbb",
      resourceId: "user-001",
      title: "三年级篮球",
    });

    expect(thread.id).toBe("conv-new-001");
    expect(thread.resourceId).toBe("user-001");
    expect(thread.title).toBe("三年级篮球");
    expect(thread.metadata?.projectId).toBe("project-bbb");

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: "user-001",
        project_id: "project-bbb",
        title: "三年级篮球",
      }),
    );
  });
});
