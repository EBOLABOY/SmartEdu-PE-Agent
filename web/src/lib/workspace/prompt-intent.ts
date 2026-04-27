export type PromptIntent = "generate" | "patch-lesson";

const GENERATION_PATTERN = /生成.*大屏|互动大屏|确认.*生成|重新生成|再生成一份|新教案|换一份/;
const LESSON_PATCH_PATTERN =
  /修改|改成|改为|调整|优化|完善|替换|删掉|删除|增加|新增|补充|强化|弱化|精简|更具体|更安全|更符合/;

export function classifyPromptIntent(query: string): PromptIntent {
  const normalized = query.trim();

  if (!normalized || GENERATION_PATTERN.test(normalized)) {
    return "generate";
  }

  return LESSON_PATCH_PATTERN.test(normalized) ? "patch-lesson" : "generate";
}

export function isLikelyLessonPatchInstruction(query: string) {
  return classifyPromptIntent(query) === "patch-lesson";
}
