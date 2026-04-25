import { describe, expect, it } from "vitest";

import { ensureLessonDocNodeIds, lessonDocToMarkdown, markdownToLessonDoc } from "@/lib/lesson-doc";

describe("lesson-doc", () => {
  it("将 Markdown 教案转换为 Tiptap 文档并保留标题与列表", () => {
    const doc = markdownToLessonDoc(`# 教案方案

## 一、基础信息

课程主题：羽毛球

- 羽毛球拍
- 计时器`);

    expect(doc.type).toBe("doc");
    expect(doc.content?.[0]?.type).toBe("heading");
    expect(doc.content?.[0]?.attrs?.id).toBeTruthy();
    expect(doc.content?.at(-1)?.type).toBe("bulletList");
  });

  it("将 Tiptap 文档导出为可用于 HTML 生成的 Markdown", () => {
    const markdown = lessonDocToMarkdown(markdownToLessonDoc(`# 教案方案

## 四、教学流程

热身活动 8 分钟

- 分组练习
- 安全提醒`));

    expect(markdown).toContain("# 教案方案");
    expect(markdown).toContain("## 四、教学流程");
    expect(markdown).toContain("热身活动 8 分钟");
    expect(markdown).toContain("- 分组练习");
  });

  it("为缺少 id 的可编辑节点补充稳定定位属性", () => {
    const doc = ensureLessonDocNodeIds({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "测试段落" }],
        },
      ],
    });

    expect(doc.content?.[0]?.attrs?.id).toMatch(/^paragraph-/);
  });
});
