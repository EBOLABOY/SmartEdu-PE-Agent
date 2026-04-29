import { describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { Database } from "@/lib/supabase/database.types";
import {
  deriveProjectDisplayTitle,
  getProjectWorkspaceHistory,
  toPersistedConversation,
  toPersistedProjectMessage,
  toPersistedProjectSummary,
} from "@/lib/persistence/project-workspace-history";

describe("project-workspace-history", () => {
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

  it("skips invalid persisted ui messages", async () => {
    const invalidMessage = await toPersistedProjectMessage({
      content: "",
      conversation_id: "11111111-1111-1111-1111-111111111111",
      created_at: "2026-04-25T12:10:00.000Z",
      created_by: "22222222-2222-2222-2222-222222222222",
      id: "33333333-3333-3333-3333-333333333333",
      is_active: true,
      project_id: "44444444-4444-4444-4444-444444444444",
      request_id: null,
      role: "assistant",
      ui_message: {},
      ui_message_id: "assistant-1",
    });

    expect(invalidMessage).toBeNull();
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

  it("loads only active messages for the latest conversation", async () => {
    const messageOrderFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "55555555-5555-5555-5555-555555555555",
          ui_message_id: "user-1",
          conversation_id: "22222222-2222-2222-2222-222222222222",
          project_id: "33333333-3333-3333-3333-333333333333",
          created_by: "11111111-1111-1111-1111-111111111111",
          role: "user",
          content: "三年级排球双循环赛制",
          ui_message: {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "三年级排球双循环赛制" }],
          },
          request_id: "req-1",
          created_at: "2026-04-29T10:00:00.000Z",
          is_active: true,
        },
      ],
      error: null,
    });
    const messageActiveEqFn = vi.fn().mockReturnValue({ order: messageOrderFn });
    const messageConversationEqFn = vi.fn().mockReturnValue({ eq: messageActiveEqFn });
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
    const artifactEqFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const artifactInFn = vi.fn().mockReturnValue({ eq: artifactEqFn });
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
          return {
            select: () => ({
              eq: projectEqFn,
            }),
          };
        }

        if (table === "artifacts") {
          return {
            select: () => ({
              in: artifactInFn,
            }),
          };
        }

        if (table === "conversations") {
          return {
            select: () => ({
              eq: conversationEqFn,
            }),
          };
        }

        if (table === "messages") {
          return {
            select: () => ({
              eq: messageConversationEqFn,
            }),
          };
        }

        return {};
      }),
    } as never;

    const result = await getProjectWorkspaceHistory(
      mockSupabase,
      "33333333-3333-3333-3333-333333333333",
    );

    expect(messageConversationEqFn).toHaveBeenCalledWith(
      "conversation_id",
      "22222222-2222-2222-2222-222222222222",
    );
    expect(messageActiveEqFn).toHaveBeenCalledWith("is_active", true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      uiMessageId: "user-1",
      content: "三年级排球双循环赛制",
    });
  });
});
