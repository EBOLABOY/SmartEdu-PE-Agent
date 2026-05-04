import { describe, expect, it } from "vitest";

import {
  buildWorkflowTraceConsoleLogs,
  formatWorkflowTraceMarket,
  formatWorkflowTracePhase,
} from "@/lib/workflow-trace-console";
import type { WorkflowTraceData } from "@/lib/lesson/authoring-contract";

const TRACE_FIXTURE: WorkflowTraceData = {
  protocolVersion: "structured-v1",
  requestId: "trace-request-id",
  mode: "lesson",
  phase: "generation",
  responseTransport: "structured-data-part",
  requestedMarket: "us-shape-k12",
  resolvedMarket: "cn-compulsory-2022",
  warnings: ["当前仓库尚未接入 SHAPE 体育标准知识库。"],
  uiHints: [],
  trace: [
    {
      step: "retrieve-standards-context",
      status: "success",
      detail: "已命中课标条目。",
      timestamp: "2026-04-25T10:00:00.000Z",
    },
    {
      step: "resolve-standards-market",
      status: "blocked",
      detail: "已回退到中国课标。",
      timestamp: "2026-04-25T10:00:01.000Z",
    },
    {
      step: "agent-stream-error",
      status: "failed",
      detail: "模型输出失败。",
      timestamp: "2026-04-25T10:00:02.000Z",
    },
  ],
  updatedAt: "2026-04-25T10:00:03.000Z",
};

describe("workflow-trace-console", () => {
  it("会把 trace 映射为控制台日志级别", () => {
    const logs = buildWorkflowTraceConsoleLogs(TRACE_FIXTURE);

    expect(logs).toHaveLength(4);
    expect(logs[0]?.level).toBe("log");
    expect(logs[1]?.level).toBe("warn");
    expect(logs[2]?.level).toBe("error");
    expect(logs[3]?.message).toContain("流程告警");
  });

  it("会格式化阶段和市场文案", () => {
    expect(formatWorkflowTracePhase(TRACE_FIXTURE.phase)).toBe("模型生成");
    expect(formatWorkflowTraceMarket(TRACE_FIXTURE)).toContain("美国 SHAPE K-12");
    expect(formatWorkflowTraceMarket(TRACE_FIXTURE)).toContain("中国义务教育课标（2022）");
  });
});
