import { describe, expect, it, vi } from "vitest";

import {
  createProjectChatPersistence,
  deriveConversationTitle,
  getPersistedMessageContent,
} from "@/lib/persistence/project-chat-store";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

describe("project-chat-store", () => {
  it("derives the conversation title from the first user message", () => {
    const title = deriveConversationTitle([
      {
        id: "user-1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "  三年级  篮球运球接力   课堂需要  配合计时器与分组积分   ",
          },
        ],
      } as SmartEduUIMessage,
    ]);

    expect(title).toBe("三年级 篮球运球接力 课堂需要 配合计时器与分组积分");
  });

  it("extracts summary text from a structured lesson artifact", () => {
    const content = getPersistedMessageContent({
      id: "assistant-lesson",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "lesson",
            contentType: "lesson-json",
            content: JSON.stringify({ title: "篮球运球接力" }),
            isComplete: true,
            status: "ready",
            source: "data-part",
            updatedAt: "2026-04-25T12:00:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage);

    expect(content).toContain("篮球运球接力");
  });

  it("collapses html artifacts into a workspace hint", () => {
    const content = getPersistedMessageContent({
      id: "assistant-html",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "html",
            contentType: "html",
            content: "<!DOCTYPE html><html lang=\"zh-CN\"><body>OK</body></html>",
            isComplete: true,
            status: "ready",
            source: "data-part",
            updatedAt: "2026-04-25T12:00:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage);

    expect(content).toBe("互动大屏已生成，请在右侧工作台查看。");
  });

  it("appends active messages without deactivating the existing branch", async () => {
    const conversationUpdateEqFn = vi.fn().mockResolvedValue({ error: null });
    const conversationUpdateFn = vi.fn().mockReturnValue({ eq: conversationUpdateEqFn });
    const conversationSelectLimitFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: "conv-001",
          title: "旧标题",
          updated_at: "2026-04-29T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const conversationSelectOrderFn = vi.fn().mockReturnValue({ limit: conversationSelectLimitFn });
    const conversationSelectEqFn = vi.fn().mockReturnValue({ order: conversationSelectOrderFn });

    const existingRowsInFn = vi.fn().mockResolvedValue({
      data: [{ ui_message_id: "user-1" }],
      error: null,
    });
    const existingRowsEqFn = vi.fn().mockReturnValue({ in: existingRowsInFn });
    const messageSelectFn = vi
      .fn()
      .mockReturnValueOnce({ eq: existingRowsEqFn });
    const upsertFn = vi.fn().mockResolvedValue({ error: null });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            select: () => ({
              eq: conversationSelectEqFn,
            }),
            update: conversationUpdateFn,
          };
        }

        if (table === "messages") {
          return {
            select: messageSelectFn,
            upsert: upsertFn,
          };
        }

        return {};
      }),
    } as never;

    const persistence = createProjectChatPersistence(mockSupabase, "user-001");

    await persistence?.saveMessages({
      projectId: "project-aaa",
      requestId: "req-001",
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "三年级排球双循环赛制" }],
        } as SmartEduUIMessage,
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
          ui_message_id: "user-1",
        }),
      ]),
      { onConflict: "project_id,ui_message_id" },
    );
  });
});
