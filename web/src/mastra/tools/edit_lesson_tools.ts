import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  updateEvaluationPayloadSchema,
  updateLearningObjectivesPayloadSchema,
  updateLessonMetaPayloadSchema,
  updateLessonStagePayloadSchema,
  updateLessonSupportPayloadSchema,
  updateLoadEstimatePayloadSchema,
} from "@/lib/lesson/patch";

export const updateLessonMetaTool = createTool({
  id: "update_lesson_meta",
  description:
    "当用户要求修改课时计划标题、副标题、教师、学校、课题、课次、人数、年级或水平段等基础信息时调用。",
  inputSchema: updateLessonMetaPayloadSchema,
  outputSchema: z
    .object({
      action: z.literal("update_lesson_meta"),
      payload: updateLessonMetaPayloadSchema,
    })
    .strict(),
  execute: async (payload) => {
    return { action: "update_lesson_meta" as const, payload };
  },
});

export const updateLearningObjectivesTool = createTool({
  id: "update_learning_objectives",
  description: "当用户要求修改教学目标（运动能力、健康行为、体育品德）时调用。",
  inputSchema: updateLearningObjectivesPayloadSchema,
  outputSchema: z
    .object({
      action: z.literal("update_objectives"),
      payload: updateLearningObjectivesPayloadSchema,
    })
    .strict(),
  execute: async (payload) => {
    return { action: "update_objectives" as const, payload };
  },
});

export const updateLessonStageTool = createTool({
  id: "update_lesson_stage",
  description:
    "当用户要求修改准备部分、基本部分或结束部分的教学内容、教法、学法、组织形式、时间或强度时调用。传入语义环节名称和原内容关键词。",
  inputSchema: updateLessonStagePayloadSchema,
  outputSchema: z
    .object({
      action: z.literal("update_stage"),
      payload: updateLessonStagePayloadSchema,
    })
    .strict(),
  execute: async (payload) => {
    return { action: "update_stage" as const, payload };
  },
});

export const updateEvaluationTool = createTool({
  id: "update_evaluation",
  description: "当用户要求修改三颗星、二颗星或一颗星评价标准时调用。",
  inputSchema: updateEvaluationPayloadSchema,
  outputSchema: z
    .object({
      action: z.literal("update_evaluation"),
      payload: updateEvaluationPayloadSchema,
    })
    .strict(),
  execute: async (payload) => {
    return { action: "update_evaluation" as const, payload };
  },
});

export const updateLessonSupportTool = createTool({
  id: "update_lesson_support",
  description:
    "当用户要求修改课时主要内容、安全保障、课后作业、课后反思、场地或器材时调用。",
  inputSchema: updateLessonSupportPayloadSchema,
  outputSchema: z
    .object({
      action: z.literal("update_support"),
      payload: updateLessonSupportPayloadSchema,
    })
    .strict(),
  execute: async (payload) => {
    return { action: "update_support" as const, payload };
  },
});

export const updateLoadEstimateTool = createTool({
  id: "update_load_estimate",
  description:
    "当用户修改运动时间、强度、练习密度或心率负荷，并且需要同步更新运动负荷估计时调用。",
  inputSchema: updateLoadEstimatePayloadSchema,
  outputSchema: z
    .object({
      action: z.literal("update_load_estimate"),
      payload: updateLoadEstimatePayloadSchema,
    })
    .strict(),
  execute: async (payload) => {
    return { action: "update_load_estimate" as const, payload };
  },
});

export const editLessonTools = {
  updateLessonMetaTool,
  updateLearningObjectivesTool,
  updateLessonStageTool,
  updateEvaluationTool,
  updateLessonSupportTool,
  updateLoadEstimateTool,
};
