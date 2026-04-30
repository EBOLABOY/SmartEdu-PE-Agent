import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";

import type { LessonIntakeResult } from "@/lib/lesson-authoring-contract";

export const LESSON_INTAKE_SYSTEM_PROMPT = `
你是的体育课时计划信息收集 Agent。你的职责不是生成课时计划，而是在生成前判断信息是否足够。

核心规则：
1. 信息不足时，readyToGenerate 必须为 false，并提出 1-3 个具体追问。
2. 生成正式课时计划前只必须明确：年级或水平段、具体课程内容。
3. 不要追问场地。场地由服务端课时计划生成管线根据课程内容、年级水平和安全要求自动匹配；用户明确指定场地时才写入 known.venue。
4. 不要追问器材。器材由服务端课时计划生成管线根据课程内容、场地、人数和安全要求自动填写。
5. 不要追问课时。课时由服务端课时计划生成管线根据课程内容、教学环节和比赛课时计划格式自动安排。
6. 不要追问学生人数。未明确人数时默认 40 人；用户明确提供人数时才覆盖默认值。
7. 不要为了推进流程而猜测年级或课题；这两项缺失时才追问。
8. 用户资料里的任教年级、水平、学校和教师可作为已知信息，但不能替代本次课题。
9. 如果缺少的信息不影响生成，可以写入 constraints，而不是追问。
10. 如果缺少具体课程内容 topic，不要只问“上什么内容”。必须在 clarification.question 中给出 3-5 个可选课程内容，让用户选择或改写；选项要结合已知年级/水平，已有场地可作为参考，没有场地也不能追问场地。
11. 追问时只能问仍未收到的信息。已经在用户输入、用户资料或项目教学记忆中确认的年级、课程内容、场地、人数、课时、器材，不得再次追问。
12. 只返回结构化 LessonIntakeResult，不要输出 Markdown、HTML 或额外解释。
`;

export function buildLessonIntakeSystemPrompt() {
  return `${LESSON_INTAKE_SYSTEM_PROMPT}

字段要求：
- known.grade：本次授课年级，例如“三年级”“水平二·四年级”。
- known.topic：本次体育课程具体内容，例如“篮球行进间运球”“立定跳远起跳与落地”。
- known.durationMinutes：只有用户明确说明课时时才填写；不要因为缺少课时而追问。
- known.studentCount：用户未明确说明时填写 40；用户明确说明时填写用户人数。
- known.venue：只有用户明确指定或用户资料已有场地时才填写；缺少场地时不要追问，让服务端课时计划生成管线自动匹配。
- known.equipment：只有用户明确限制或指定器材时才填写；不要因为缺少器材而追问。
- missing：只列真正需要用户补充的字段，默认不要包含 duration、studentCount、venue、equipment。
- clarifications：面向教师的直接追问对象数组。每一项都必须包含 field 和 question，且 field 必须属于当前仍然 missing 的字段。禁止把多个字段揉成一句笼统追问。clarifications 应严格按追问顺序输出；如果缺 topic，question 必须带课程内容选项，例如“请选择本次课程内容，或直接改写：1. 篮球行进间运球；2. 足球脚内侧传接球；3. 立定跳远起跳与落地；4. 接力跑交接棒”。
- summary：readyToGenerate 为 true 时，写成可直接交给服务端课时计划生成管线的教学 brief；未说明人数时必须写“学生人数默认 40 人”；课时、场地和器材说明为“由服务端课时计划生成管线自动匹配”。
- reason：说明为什么可以生成或为什么必须先追问。`;
}

function formatKnownInfo(known: LessonIntakeResult["known"]) {
  if (!known) {
    return ["- 暂无可靠已知信息"];
  }

  const lines = [
    known.grade ? `- 年级/水平：${known.grade}` : null,
    known.teachingLevel ? `- 水平：${known.teachingLevel}` : null,
    known.topic ? `- 课程内容：${known.topic}` : null,
    known.durationMinutes ? `- 课时：${known.durationMinutes} 分钟` : "- 课时：由服务端课时计划生成管线自动匹配",
    known.studentCount ? `- 学生人数：${known.studentCount} 人` : "- 学生人数：默认 40 人",
    known.venue ? `- 场地：${known.venue}` : "- 场地：由服务端课时计划生成管线根据课程内容自动匹配",
    known.equipment?.length ? `- 器材限制/指定：${known.equipment.join("、")}` : "- 器材：由服务端课时计划生成管线自动配置",
    known.objectives?.length ? `- 目标倾向：${known.objectives.join("；")}` : null,
    known.constraints?.length ? `- 约束：${known.constraints.join("；")}` : null,
  ].filter(Boolean);

  return lines.length ? lines : ["- 暂无可靠已知信息"];
}

export function formatLessonIntakeResultForPrompt(intake: LessonIntakeResult) {
  const parts = [
    "课时计划生成前信息收集结果：",
    `状态：${intake.readyToGenerate ? "信息足够，可以生成" : "信息不足，必须先追问"}`,
    "",
    "已确认信息：",
    ...formatKnownInfo(intake.known),
    "",
    intake.summary ? `教学 brief：\n${intake.summary}` : null,
    intake.missing.length ? `仍缺字段：${intake.missing.join(", ")}` : null,
    `判断理由：${intake.reason}`,
  ].filter(Boolean);

  return parts.join("\n");
}

export function formatLessonIntakeQuestions(intake: LessonIntakeResult) {
  const questions = intake.clarifications.length
    ? intake.clarifications.map((item) => item.question)
    : ["请补充本次课的年级或水平段和具体课程内容。"];

  return [
    "我先不生成课时计划。现在信息还不够，直接生成会变成瞎猜。",
    "",
    "请先补充：",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
  ].join("\n");
}

export function createLessonIntakeAgent(model: AgentConfig["model"]) {
  return new Agent({
    id: "lesson-intake-agent",
    name: "创AI体育课时计划信息收集智能体",
    description: "在正式生成体育课时计划前，判断信息是否足够，并在必要时追问教师。",
    instructions: LESSON_INTAKE_SYSTEM_PROMPT,
    model,
  });
}
