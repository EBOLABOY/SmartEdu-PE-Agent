import type { WorkflowStreamEvent } from "@mastra/core/workflows";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowTraceData } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import {
  applyWorkflowStreamEvent,
  createLessonWorkflowTraceState,
  runLessonAuthoringWorkflowWithTrace,
} from "./lesson_workflow_stream";

function createIntentResult() {
  return {
    intent: "generate_lesson" as const,
    confidence: 0.91,
    reason: "测试用生成意图。",
  };
}

const workflowOutput = {
  system: "system prompt",
  standardsContext: "",
  standards: {
    requestedMarket: "cn-compulsory-2022",
    resolvedMarket: "cn-compulsory-2022",
    corpus: {
      corpusId: "cn",
      displayName: "课程标准",
      issuer: "教育部",
      version: "2022",
      url: "https://example.com/standards",
      availability: "ready",
    },
    referenceCount: 0,
    references: [],
  },
  generationPlan: {
    mode: "lesson",
    confirmedLessonRequired: false,
    outputProtocol: "lesson-json",
    responseTransport: "structured-data-part",
    assistantTextPolicy: "suppress-json-text",
    maxSteps: 5,
    protocolVersion: "structured-v1",
  },
  safety: {
    htmlSandboxRequired: false,
    externalNetworkAllowed: false,
    forbiddenCapabilities: [],
    warnings: [],
  },
  uiHints: [
    {
      action: "switch_tab",
      params: {
        tab: "lesson",
      },
    },
  ],
  decision: {
    type: "generate",
    intentResult: createIntentResult(),
  },
  trace: [
    {
      step: "retrieve-standards-context",
      status: "success",
      detail: "课程标准检索完成。",
    },
  ],
} satisfies LessonWorkflowOutput;

function createEventStream(events: WorkflowStreamEvent[]) {
  return new ReadableStream<WorkflowStreamEvent>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event);
      }

      controller.close();
    },
  });
}

describe("lesson workflow stream adapter", () => {
  it("turns Mastra workflow step events into stable trace updates", () => {
    const state = createLessonWorkflowTraceState({
      query: "basketball lesson",
      mode: "lesson",
      market: "cn-compulsory-2022",
    });

    const started = applyWorkflowStreamEvent(state, {
      type: "workflow-step-start",
      runId: "run-1",
      from: "WORKFLOW",
      payload: {
        id: "retrieve-standards-context",
        status: "running",
        stepCallId: "step-1",
      },
    } as WorkflowStreamEvent);

    expect(started).toBe(true);
    expect(state.trace).toEqual([
      expect.objectContaining({
        step: "retrieve-standards-context",
        status: "running",
      }),
    ]);

    const finished = applyWorkflowStreamEvent(state, {
      type: "workflow-step-result",
      runId: "run-1",
      from: "WORKFLOW",
      payload: {
        id: "retrieve-standards-context",
        status: "success",
        stepCallId: "step-1",
        output: {
          ...workflowOutput,
          trace: workflowOutput.trace,
        },
      },
    } as WorkflowStreamEvent);

    expect(finished).toBe(true);
    expect(state.trace).toEqual(workflowOutput.trace);
    expect(state.standards?.references).toEqual([]);
    expect(state.uiHints).toEqual(workflowOutput.uiHints);
  });

  it("runs workflow through run.stream and publishes trace before completion", async () => {
    const traces: WorkflowTraceData[] = [];
    const createRun = vi.fn(async () => ({
      stream: vi.fn(() => ({
        fullStream: createEventStream([
          {
            type: "workflow-step-start",
            runId: "run-1",
            from: "WORKFLOW",
            payload: {
              id: "retrieve-standards-context",
              status: "running",
              stepCallId: "step-1",
            },
          } as WorkflowStreamEvent,
          {
            type: "workflow-step-result",
            runId: "run-1",
            from: "WORKFLOW",
            payload: {
              id: "retrieve-standards-context",
              status: "success",
              stepCallId: "step-1",
              output: workflowOutput,
            },
          } as WorkflowStreamEvent,
        ]),
        result: Promise.resolve({
          result: workflowOutput,
          status: "success",
        }),
      })),
      start: vi.fn(),
    }));

    const result = await runLessonAuthoringWorkflowWithTrace(
      { createRun },
      {
        query: "basketball lesson",
        mode: "lesson",
        market: "cn-compulsory-2022",
      },
      {
        requestId: "request-1",
        onTrace: (trace) => traces.push(trace),
      },
    );

    expect(result).toStrictEqual(workflowOutput);
    expect(createRun).toHaveBeenCalledOnce();
    expect(traces[0]).toEqual(
      expect.objectContaining({
        phase: "workflow",
        trace: [
          expect.objectContaining({
            step: "classify-intent",
            status: "running",
          }),
        ],
      }),
    );
    expect(traces.at(-1)?.trace).toEqual(workflowOutput.trace);
    expect(traces.at(-1)?.uiHints).toEqual(workflowOutput.uiHints);
  });
});
