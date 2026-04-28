import type { FullOutput } from "@mastra/core/stream";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import {
  CompetitionLessonPatchError,
  type CompetitionLessonPatch,
} from "@/lib/competition-lesson-patch";

import { runCompetitionLessonPatchSkill } from "./competition_lesson_patch_skill";

function fullOutput(object: CompetitionLessonPatch) {
  return { object } as FullOutput<CompetitionLessonPatch>;
}

describe("competition lesson patch skill", () => {
  it("uses the Mastra lesson patch agent runner and applies the returned patch", async () => {
    const patch: CompetitionLessonPatch = {
      operations: [
        {
          op: "replace",
          path: "/title",
          value: "篮球行进间运球课",
          reason: "按用户要求修改教案标题。",
        },
      ],
    };
    const agentGenerate = vi.fn().mockResolvedValue(fullOutput(patch));

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

    expect(result.patch).toEqual(patch);
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
        structuredOutput: expect.objectContaining({
          jsonPromptInjection: true,
          schema: expect.any(Object),
        }),
      }),
    );
  });

  it("rejects an agent patch that breaks the lesson plan schema", async () => {
    const agentGenerate = vi.fn().mockResolvedValue(
      fullOutput({
        operations: [
          {
            op: "replace",
            path: "/evaluation/1/description",
            value: "",
            reason: "非法空评价描述。",
          },
        ],
      }),
    );

    await expect(
      runCompetitionLessonPatchSkill(
        {
          lessonPlan: DEFAULT_COMPETITION_LESSON_PLAN,
          instruction: "把第二档评价清空",
          targetPaths: ["/evaluation/1/description"],
        },
        {
          agentGenerate,
          maxSteps: 2,
          requestId: "request-patch-invalid",
        },
      ),
    ).rejects.toThrow(CompetitionLessonPatchError);
  });
});
