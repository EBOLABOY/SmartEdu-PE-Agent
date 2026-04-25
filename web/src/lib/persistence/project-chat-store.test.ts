import { describe, expect, it } from "vitest";

import {
  deriveConversationTitle,
  getPersistedMessageContent,
} from "@/lib/persistence/project-chat-store";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

describe("project-chat-store", () => {
  it("会把首条用户消息压缩为会话标题", () => {
    const title = deriveConversationTitle([
      {
        id: "user-1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "  三年级   篮球运球接力   课堂需要   配合计时器与分组积分   ",
          },
        ],
      } as SmartEduUIMessage,
    ]);

    expect(title).toBe("三年级 篮球运球接力 课堂需要 配合计时器与分组积分");
  });

  it("会从结构化 lesson Artifact 中提取消息摘要", () => {
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
            contentType: "markdown",
            content: "# 教案方案\n\n## 热身",
            isComplete: true,
            status: "ready",
            source: "data-part",
            updatedAt: "2026-04-25T12:00:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage);

    expect(content).toContain("# 教案方案");
  });

  it("会把结构化 html Artifact 摘要化为工作台提示文案", () => {
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
});
