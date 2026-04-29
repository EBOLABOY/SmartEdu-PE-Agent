import { describe, expect, it, vi } from "vitest";

import {
  SupabaseMastraStorageAdapter,
  createMastraStorageAdapter,
  type MastraMessage,
} from "./mastra-storage-adapter";

function buildTestMessage(overrides: Partial<MastraMessage> = {}): MastraMessage {
  return {
    id: "msg-001",
    threadId: "project-aaa",
    role: "user",
    content: "三年级排球双循环赛制",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("createMastraStorageAdapter", () => {
  it("returns null when supabase client is unavailable", () => {
    expect(createMastraStorageAdapter(null)).toBeNull();
  });

  it("returns an adapter instance when supabase client exists", () => {
    const mockSupabase = {} as never;
    const adapter = createMastraStorageAdapter(mockSupabase);

    expect(adapter).toBeInstanceOf(SupabaseMastraStorageAdapter);
  });
});

describe("SupabaseMastraStorageAdapter.listMessages", () => {
  it("returns an empty array when there are no active messages", async () => {
    const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
    const activeEqFn = vi.fn().mockReturnValue({ order: orderFn });
    const projectEqFn = vi.fn().mockReturnValue({ eq: activeEqFn });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: projectEqFn,
        }),
      })),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const result = await adapter.listMessages({ threadId: "project-aaa" });

    expect(projectEqFn).toHaveBeenCalledWith("project_id", "project-aaa");
    expect(activeEqFn).toHaveBeenCalledWith("is_active", true);
    expect(result).toEqual([]);
  });

  it("reads only active messages and reorders them into chronological order", async () => {
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
    const activeEqFn = vi.fn().mockReturnValue({ order: orderFn });
    const projectEqFn = vi.fn().mockReturnValue({ eq: activeEqFn });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: projectEqFn,
        }),
      })),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const result = await adapter.listMessages({ threadId: "project-aaa", limit: 10 });

    expect(projectEqFn).toHaveBeenCalledWith("project_id", "project-aaa");
    expect(activeEqFn).toHaveBeenCalledWith("is_active", true);
    expect(orderFn).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limitFn).toHaveBeenCalledWith(10);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "msg-001",
      role: "user",
      content: "这是第一条",
    });
    expect(result[0]?.metadata?.uiMessage).toBe('{"type":"stringified"}');
    expect(result[1]).toMatchObject({
      id: "msg-002",
      role: "assistant",
      content: "这是第二条",
    });
    expect(result[1]?.metadata?.uiMessage).toEqual({ foo: "bar" });
  });
});

describe("SupabaseMastraStorageAdapter.saveMessages", () => {
  it("does nothing when the input message list is empty", async () => {
    const mockSupabase = {
      from: vi.fn(),
    };
    const adapter = new SupabaseMastraStorageAdapter(mockSupabase as never);

    await expect(
      adapter.saveMessages({
        threadId: "project-aaa",
        resourceId: "user-001",
        messages: [],
      }),
    ).resolves.toBeUndefined();

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("upserts the active branch and deactivates stale messages", async () => {
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

    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const updateInFn = vi.fn().mockResolvedValue({ error: null });
    const updateEqFn = vi.fn().mockReturnValue({ in: updateInFn });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn });
    const activeRows = {
      data: [{ ui_message_id: "ui-msg-001" }, { ui_message_id: "stale-001" }],
      error: null,
    };
    const activeEqSecondFn = vi.fn().mockResolvedValue(activeRows);
    const activeEqFirstFn = vi.fn().mockReturnValue({ eq: activeEqSecondFn });
    const selectFn = vi.fn().mockReturnValue({ eq: activeEqFirstFn });

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
            select: selectFn,
            update: updateFn,
            upsert: upsertFn,
          };
        }

        return {};
      }),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);

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

    expect(upsertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          conversation_id: "conv-001",
          created_by: "user-001",
          is_active: true,
          project_id: "project-aaa",
          request_id: "req-001",
          role: "user",
          ui_message_id: "ui-msg-001",
        }),
      ]),
      { onConflict: "project_id,ui_message_id" },
    );
    expect(selectFn).toHaveBeenCalledWith("ui_message_id");
    expect(activeEqFirstFn).toHaveBeenCalledWith("project_id", "project-aaa");
    expect(activeEqSecondFn).toHaveBeenCalledWith("is_active", true);
    expect(updateFn).toHaveBeenCalledWith({ is_active: false });
    expect(updateEqFn).toHaveBeenCalledWith("project_id", "project-aaa");
    expect(updateInFn).toHaveBeenCalledWith("ui_message_id", ["stale-001"]);
  });
});

describe("SupabaseMastraStorageAdapter.createThread", () => {
  it("maps threadId to project_id when creating a conversation", async () => {
    const insertedRow = {
      id: "conv-new-001",
      created_by: "user-001",
      project_id: "project-bbb",
      title: "三年级排球",
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
      title: "三年级排球",
    });

    expect(thread).toMatchObject({
      id: "conv-new-001",
      resourceId: "user-001",
      title: "三年级排球",
    });
    expect(thread.metadata?.projectId).toBe("project-bbb");
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: "user-001",
        project_id: "project-bbb",
        title: "三年级排球",
      }),
    );
  });
});
