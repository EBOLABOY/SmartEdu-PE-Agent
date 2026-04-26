import { describe, expect, it } from "vitest";

import { lessonAuthoringWorkflow } from "@/mastra/workflows/lesson_workflow";

describe("lesson-workflow", () => {
  it("会规划 structured-only 推流链路", async () => {
    const run = await lessonAuthoringWorkflow.createRun();
    const result = await run.start({
      inputData: {
        query: "五年级篮球运球课",
        mode: "lesson",
        market: "cn-compulsory-2022",
      },
    });

    expect(result.status).toBe("success");

    if (result.status !== "success") {
      return;
    }

    expect(result.result.generationPlan.responseTransport).toBe("structured-data-part");
    expect(result.result.generationPlan.protocolVersion).toBe("structured-v1");
    expect(result.result.generationPlan.outputProtocol).toBe("markdown");
    expect(result.result.generationPlan.assistantTextPolicy).toBe("mirror-markdown");
  });

  it("会拦截未确认教案的 HTML 生成", async () => {
    const run = await lessonAuthoringWorkflow.createRun();
    const result = await run.start({
      inputData: {
        query: "请生成互动大屏",
        mode: "html",
        market: "cn-compulsory-2022",
      },
    });

    expect(result.status).toBe("failed");

    if (result.status === "failed" && result.error instanceof Error) {
      expect(result.error.message).toContain("必须提供已确认教案");
    }
  });
});
