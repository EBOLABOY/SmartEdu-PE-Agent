import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProjectChatPersistence,
  deriveConversationTitle,
  getPersistedMessageContent,
} from "@/lib/persistence/project-chat-store";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

const { saveConversationMessagesToS3Mock } = vi.hoisted(() => ({
  saveConversationMessagesToS3Mock: vi.fn(),
}));

vi.mock("@/lib/persistence/conversation-message-manifest", () => ({
  saveConversationMessagesToS3: saveConversationMessagesToS3Mock,
}));

describe("project-chat-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
            htmlPages: [
              {
                pageIndex: 0,
                pageRole: "cover",
                pageTitle: "OK",
                sectionHtml:
                  '<section class="slide cover-slide active" data-slide-kind="cover"><main class="cover-shell"><h1>OK</h1></main></section>',
              },
            ],
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

  it("writes messages to S3 and keeps Supabase as a lightweight conversation index", async () => {
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
          throw new Error("messages table should not be used for new chat persistence");
        }

        return {};
      }),
    } as never;

    const persistence = createProjectChatPersistence(mockSupabase, "user-001");
    const message = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "三年级排球双循环赛制" }],
    } as SmartEduUIMessage;

    await persistence?.saveMessages({
      projectId: "project-aaa",
      requestId: "req-001",
      messages: [message],
    });

    expect(saveConversationMessagesToS3Mock).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messages: [message],
      projectId: "project-aaa",
      requestId: "req-001",
    });
    expect(conversationUpdateFn).toHaveBeenCalled();
  });
});
