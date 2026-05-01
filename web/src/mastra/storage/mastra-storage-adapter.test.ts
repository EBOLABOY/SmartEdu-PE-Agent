import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SupabaseMastraStorageAdapter,
  createMastraStorageAdapter,
  type MastraMessage,
} from "./mastra-storage-adapter";

const { listConversationMessagesFromS3Mock, saveConversationMessagesToS3Mock } = vi.hoisted(() => ({
  listConversationMessagesFromS3Mock: vi.fn(),
  saveConversationMessagesToS3Mock: vi.fn(),
}));

vi.mock("@/lib/persistence/conversation-message-manifest", () => ({
  listConversationMessagesFromS3: listConversationMessagesFromS3Mock,
  saveConversationMessagesToS3: saveConversationMessagesToS3Mock,
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    listConversationMessagesFromS3Mock.mockResolvedValue(null);
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
    listConversationMessagesFromS3Mock.mockResolvedValue(null);
  });

  it("returns messages from S3 when a conversation manifest exists", async () => {
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
    const mockSupabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve(conversationSelectResult),
              }),
            }),
          }),
        }),
      })),
    } as never;
    listConversationMessagesFromS3Mock.mockResolvedValueOnce([
      {
        id: "msg-001",
        uiMessageId: "msg-001",
        role: "user",
        content: "S3 消息",
        createdAt: "2026-04-28T10:00:00.000Z",
        uiMessage: { id: "msg-001", role: "user", parts: [{ type: "text", text: "S3 消息" }] },
      },
    ]);

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const result = await adapter.listMessages({ threadId: "project-aaa", limit: 10 });

    expect(listConversationMessagesFromS3Mock).toHaveBeenCalledWith({
      conversationId: "conv-001",
      limit: 10,
      projectId: "project-aaa",
    });
    expect(result[0]).toMatchObject({
      content: "S3 消息",
      id: "msg-001",
      role: "user",
    });
  });

  it("returns an empty array when no thread exists", async () => {
    const conversationMaybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const conversationLimitFn = vi.fn().mockReturnValue({
      maybeSingle: conversationMaybeSingleFn,
    });
    const conversationOrderFn = vi.fn().mockReturnValue({ limit: conversationLimitFn });
    const conversationEqFn = vi.fn().mockReturnValue({ order: conversationOrderFn });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            select: () => ({
              eq: conversationEqFn,
            }),
          };
        }

        return {};
      }),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const result = await adapter.listMessages({ threadId: "project-aaa" });

    expect(result).toEqual([]);
  });

  it("returns an empty array when the S3 conversation manifest is unavailable", async () => {
    const conversationMaybeSingleFn = vi.fn().mockResolvedValue({
      data: {
        id: "conv-001",
        created_by: "user-001",
        title: null,
        created_at: "2026-04-28T00:00:00Z",
        updated_at: "2026-04-28T00:00:00Z",
      },
      error: null,
    });
    const conversationLimitFn = vi.fn().mockReturnValue({
      maybeSingle: conversationMaybeSingleFn,
    });
    const conversationOrderFn = vi.fn().mockReturnValue({ limit: conversationLimitFn });
    const conversationEqFn = vi.fn().mockReturnValue({ order: conversationOrderFn });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            select: () => ({
              eq: conversationEqFn,
            }),
          };
        }

        return {};
      }),
    } as never;

    const adapter = new SupabaseMastraStorageAdapter(mockSupabase);
    const result = await adapter.listMessages({ threadId: "project-aaa", limit: 10 });

    expect(listConversationMessagesFromS3Mock).toHaveBeenCalledWith({
      conversationId: "conv-001",
      limit: 10,
      projectId: "project-aaa",
    });
    expect(result).toEqual([]);
  });
});

describe("SupabaseMastraStorageAdapter.saveMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConversationMessagesFromS3Mock.mockResolvedValue(null);
  });

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

  it("writes messages to S3 instead of the Supabase messages table", async () => {
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
          throw new Error("messages table should not be used for new message persistence");
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

    expect(saveConversationMessagesToS3Mock).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messages: [
        expect.objectContaining({
          id: "ui-msg-001",
          role: "user",
        }),
      ],
      projectId: "project-aaa",
      requestId: "req-001",
    });
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
