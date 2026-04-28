import type { FullOutput } from "@mastra/core/stream";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import {
  CompetitionLessonPatchError,
  type CompetitionLessonSemanticUpdate,
} from "@/lib/competition-lesson-patch";

import { runCompetitionLessonPatchSkill } from "./competition_lesson_patch_skill";

function fullOutputFromToolResults(
  semanticUpdates: CompetitionLessonSemanticUpdate[],
) {
  return {
    steps: [],
    toolResults: semanticUpdates.map((result, index) => ({
      type: "tool-result",
      payload: {
        toolCallId: `tool-${index}`,
        toolName: result.action,
        result,
      },
    })),
  } as unknown as FullOutput<unknown>;
}

describe("competition lesson patch skill", () => {
  it("uses the Mastra lesson patch agent runner and applies semantic tool results", async () => {
    const semanticUpdate: CompetitionLessonSemanticUpdate = {
      action: "update_lesson_meta",
      payload: {
        title: "篮球行进间运球课",
        reason: "按用户要求修改教案标题。",
      },
    };
    const agentGenerate = vi.fn().mockResolvedValue(fullOutputFromToolResults([semanticUpdate]));

    const result = await runCompetitionLessonPatchSkill(
      {
        lessonPlan: DEFAULT_COMPETITION_LESSON_PLAN,
        instruction: "把标题改成篮球行进间运球课",
        targetPaths: ["/title"],
      },
      {
        agentGenerate,
        maxSteps: 2,
        requestId: "request-patch-agent",
      },
    );

    expect(result.patch).toEqual({
      operations: [
        {
          op: "replace",
          path: "/title",
          value: "篮球行进间运球课",
          reason: "按用户要求修改教案标题。",
        },
      ],
    });
    expect(result.patchSummary).toBe("基础信息");
    expect(result.semanticUpdates).toEqual([semanticUpdate]);
    expect(result.lessonPlan.title).toBe("篮球行进间运球课");
    expect(DEFAULT_COMPETITION_LESSON_PLAN.title).toBe("XXX");
    expect(agentGenerate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("/title"),
        }),
      ],
      expect.objectContaining({
        maxSteps: 2,
        providerOptions: {
          openai: {
            store: true,
          },
        },
      }),
    );
    expect(agentGenerate.mock.calls[0]?.[1]).not.toHaveProperty("structuredOutput");
  });

  it("rejects ambiguous semantic stage updates instead of guessing an array index", async () => {
    const lessonPlan = structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);
    const basicRow = structuredClone(lessonPlan.periodPlan.rows[1]!);
    basicRow.content = ["第二个基本部分练习"];
    lessonPlan.periodPlan.rows.splice(2, 0, basicRow);

    const agentGenerate = vi.fn().mockResolvedValue(
      fullOutputFromToolResults([
        {
          action: "update_stage",
          payload: {
            targetStageName: "基本部分",
            newTime: "12分钟",
            reason: "用户要求调整基本部分时间。",
          },
        },
      ]),
    );

    await expect(
      runCompetitionLessonPatchSkill(
        {
          lessonPlan,
          instruction: "把基本部分改成 12 分钟",
          targetPaths: ["/periodPlan/rows/1/time"],
        },
        {
          agentGenerate,
          maxSteps: 2,
          requestId: "request-patch-ambiguous",
        },
      ),
    ).rejects.toThrow(CompetitionLessonPatchError);
  });
});
