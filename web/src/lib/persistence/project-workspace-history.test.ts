import { describe, expect, it } from "vitest";

import {
  toPersistedConversation,
  toPersistedProjectMessage,
  toPersistedProjectSummary,
} from "@/lib/persistence/project-workspace-history";
import type { Database } from "@/lib/supabase/database.types";

describe("project-workspace-history", () => {
  it("会把项目行映射为前端项目摘要", () => {
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

  it("会把 Supabase 时间字符串规范化为前端契约需要的 UTC ISO 字符串", () => {
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

  it("会跳过不合法的持久化 UIMessage", async () => {
    const invalidMessage = await toPersistedProjectMessage({
      content: "",
      conversation_id: "11111111-1111-1111-1111-111111111111",
      created_at: "2026-04-25T12:10:00.000Z",
      created_by: "22222222-2222-2222-2222-222222222222",
      id: "33333333-3333-3333-3333-333333333333",
      project_id: "44444444-4444-4444-4444-444444444444",
      request_id: null,
      role: "assistant",
      ui_message: {},
      ui_message_id: "assistant-1",
    });

    expect(invalidMessage).toBeNull();
  });

  it("会映射会话基础信息", () => {
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
});
