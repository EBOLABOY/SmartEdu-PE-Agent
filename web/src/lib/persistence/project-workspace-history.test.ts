import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { Database } from "@/lib/supabase/database.types";
import {
  deriveProjectDisplayTitle,
  getProjectWorkspaceHistory,
  listProjectsForUser,
  toPersistedConversation,
  toPersistedProjectSummary,
} from "@/lib/persistence/project-workspace-history";

const { listConversationMessagesFromS3Mock } = vi.hoisted(() => ({
  listConversationMessagesFromS3Mock: vi.fn(),
}));

vi.mock("@/lib/persistence/conversation-message-manifest", () => ({
  listConversationMessagesFromS3: listConversationMessagesFromS3Mock,
}));

describe("project-workspace-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConversationMessagesFromS3Mock.mockResolvedValue(null);
  });

  it("maps project rows into persisted project summaries", () => {
    const project = toPersistedProjectSummary({
      archived_at: null,
      created_at: "2026-04-25T12:00:00.000Z",
      description: "三年级篮球单元",
      id: "11111111-1111-1111-1111-111111111111",
      market: "cn-compulsory-2022",
      metadata: {},
      organization_id: "22222222-2222-2222-2222-222222222222",
      owner_id: "33333333-3333-3333-3333-333333333333",
      title: "篮球单元项目",
      updated_at: "2026-04-25T12:05:00.000Z",
    });

    expect(project.title).toBe("篮球单元项目");
    expect(project.description).toBe("三年级篮球单元");
  });

  it("prefers the current lesson plan title over generic artifact titles", () => {
    const title = deriveProjectDisplayTitle({
      artifactTitle: "课时计划 Artifact",
      lessonContent: JSON.stringify({
        ...DEFAULT_COMPETITION_LESSON_PLAN,
        title: "篮球运球接力与合作练习",
      }),
      lessonContentType: "lesson-json",
      projectTitle: "三年级篮球，40人，半场",
    });

    expect(title).toBe("篮球运球接力与合作练习");
  });

  it("falls back to the project title when the lesson title is unavailable", () => {
    const title = deriveProjectDisplayTitle({
      artifactTitle: "课时计划 Artifact",
      lessonContent: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
      lessonContentType: "lesson-json",
      projectTitle: "三年级篮球，40人，半场",
    });

    expect(title).toBe("三年级篮球，40人，半场");
  });

  it("normalizes Supabase timestamps into UTC ISO strings", () => {
    const project = toPersistedProjectSummary({
      archived_at: null,
      created_at: "2026-04-25T12:00:00+00:00",
      description: null,
      id: "11111111-1111-1111-1111-111111111111",
      market: "cn-compulsory-2022",
      metadata: {},
      organization_id: "22222222-2222-2222-2222-222222222222",
      owner_id: "33333333-3333-3333-3333-333333333333",
      title: "篮球单元项目",
      updated_at: "2026-04-25 12:05:00+00",
    });

    expect(project.createdAt).toBe("2026-04-25T12:00:00.000Z");
    expect(project.updatedAt).toBe("2026-04-25T12:05:00.000Z");
  });

  it("lists project summaries from the projects index without loading artifact blobs", async () => {
    const projectsOrderFn = vi.fn().mockResolvedValue({
      data: [
        {
          archived_at: null,
          created_at: "2026-04-25T12:00:00.000Z",
          description: null,
          id: "33333333-3333-3333-3333-333333333333",
          market: "cn-compulsory-2022",
          metadata: {},
          organization_id: "44444444-4444-4444-4444-444444444444",
          owner_id: "11111111-1111-1111-1111-111111111111",
          title: "项目原始标题",
          updated_at: "2026-04-29T10:05:00.000Z",
        },
      ],
      error: null,
    });
    const projectsIsFn = vi.fn().mockReturnValue({ order: projectsOrderFn });
    const from = vi.fn((table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            is: projectsIsFn,
          }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    });

    const projects = await listProjectsForUser({ from } as never);

    expect(projects[0]?.title).toBe("项目原始标题");
    expect(from).toHaveBeenCalledWith("projects");
  });

  it("maps persisted conversation metadata", () => {
    const conversation = toPersistedConversation({
      created_at: "2026-04-25T12:00:00.000Z",
      created_by: "11111111-1111-1111-1111-111111111111",
      id: "22222222-2222-2222-2222-222222222222",
      project_id: "33333333-3333-3333-3333-333333333333",
      title: "篮球单元项目",
      updated_at: "2026-04-25T12:03:00.000Z",
    } satisfies Database["public"]["Tables"]["conversations"]["Row"]);

    expect(conversation.title).toBe("篮球单元项目");
    expect(conversation.createdAt).toBe("2026-04-25T12:00:00.000Z");
    expect(conversation.updatedAt).toBe("2026-04-25T12:03:00.000Z");
  });

  it("loads messages from S3 for the latest conversation", async () => {
    listConversationMessagesFromS3Mock.mockResolvedValueOnce([
      {
        id: "55555555-5555-4555-8555-555555555555",
        uiMessageId: "user-1",
        role: "user",
        content: "S3 消息",
        createdAt: "2026-04-29T10:00:00.000Z",
        uiMessage: {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "S3 消息" }],
        },
      },
    ]);
    const conversationLimitFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          created_at: "2026-04-29T09:59:00.000Z",
          created_by: "11111111-1111-1111-1111-111111111111",
          project_id: "33333333-3333-3333-3333-333333333333",
          title: "排球方案",
          updated_at: "2026-04-29T10:01:00.000Z",
        },
      ],
      error: null,
    });
    const conversationOrderFn = vi.fn().mockReturnValue({ limit: conversationLimitFn });
    const conversationEqFn = vi.fn().mockReturnValue({ order: conversationOrderFn });
    const projectSingleFn = vi.fn().mockResolvedValue({
      data: {
        archived_at: null,
        created_at: "2026-04-25T12:00:00.000Z",
        description: "desc",
        id: "33333333-3333-3333-3333-333333333333",
        market: "cn-compulsory-2022",
        metadata: {},
        organization_id: "44444444-4444-4444-4444-444444444444",
        owner_id: "11111111-1111-1111-1111-111111111111",
        title: "项目标题",
        updated_at: "2026-04-29T10:05:00.000Z",
      },
      error: null,
    });
    const projectEqFn = vi.fn().mockReturnValue({ single: projectSingleFn });
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "projects") {
          return { select: () => ({ eq: projectEqFn }) };
        }
        if (table === "conversations") {
          return { select: () => ({ eq: conversationEqFn }) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as never;

    const result = await getProjectWorkspaceHistory(
      mockSupabase,
      "33333333-3333-3333-3333-333333333333",
    );

    expect(listConversationMessagesFromS3Mock).toHaveBeenCalledWith({
      conversationId: "22222222-2222-2222-2222-222222222222",
      projectId: "33333333-3333-3333-3333-333333333333",
    });
    expect(result.messages[0]?.content).toBe("S3 消息");
  });

  it("S3 conversation manifest 不存在时返回空消息列表", async () => {
    const conversationLimitFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          created_at: "2026-04-29T09:59:00.000Z",
          created_by: "11111111-1111-1111-1111-111111111111",
          project_id: "33333333-3333-3333-3333-333333333333",
          title: "排球方案",
          updated_at: "2026-04-29T10:01:00.000Z",
        },
      ],
      error: null,
    });
    const conversationOrderFn = vi.fn().mockReturnValue({ limit: conversationLimitFn });
    const conversationEqFn = vi.fn().mockReturnValue({ order: conversationOrderFn });
    const projectSingleFn = vi.fn().mockResolvedValue({
      data: {
        archived_at: null,
        created_at: "2026-04-25T12:00:00.000Z",
        description: "desc",
        id: "33333333-3333-3333-3333-333333333333",
        market: "cn-compulsory-2022",
        metadata: {},
        organization_id: "44444444-4444-4444-4444-444444444444",
        owner_id: "11111111-1111-1111-1111-111111111111",
        title: "项目标题",
        updated_at: "2026-04-29T10:05:00.000Z",
      },
      error: null,
    });
    const projectEqFn = vi.fn().mockReturnValue({ single: projectSingleFn });
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "projects") {
          return { select: () => ({ eq: projectEqFn }) };
        }
        if (table === "conversations") {
          return { select: () => ({ eq: conversationEqFn }) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as never;

    const result = await getProjectWorkspaceHistory(
      mockSupabase,
      "33333333-3333-3333-3333-333333333333",
    );

    expect(result.messages).toEqual([]);
  });
});
