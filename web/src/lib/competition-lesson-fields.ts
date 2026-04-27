import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";

export type CompetitionLessonEditableField = {
  label: string;
  path: string;
  group: string;
  description: string;
  read: (lesson: CompetitionLessonPlan) => string;
};

function readTextBlock(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean).join("；");
}

export const COMPETITION_LESSON_EDITABLE_FIELDS: CompetitionLessonEditableField[] = [
  {
    group: "基础信息",
    label: "课题主标题",
    path: "/title",
    description: "修改教案顶部居中的主标题。",
    read: (lesson) => lesson.title,
  },
  {
    group: "基础信息",
    label: "副标题",
    path: "/subtitle",
    description: "修改水平、学段或年级副标题。",
    read: (lesson) => lesson.subtitle,
  },
  {
    group: "学习目标",
    label: "运动能力目标",
    path: "/learningObjectives/sportAbility/0",
    description: "改写学生动作技能、体能或运动认知目标。",
    read: (lesson) => readTextBlock(lesson.learningObjectives.sportAbility),
  },
  {
    group: "学习目标",
    label: "健康行为目标",
    path: "/learningObjectives/healthBehavior/0",
    description: "改写安全意识、规则意识、运动习惯目标。",
    read: (lesson) => readTextBlock(lesson.learningObjectives.healthBehavior),
  },
  {
    group: "学习目标",
    label: "体育品德目标",
    path: "/learningObjectives/sportMorality/0",
    description: "改写合作、挑战、纪律、尊重等品德目标。",
    read: (lesson) => readTextBlock(lesson.learningObjectives.sportMorality),
  },
  {
    group: "教学重难点",
    label: "学生学习重难点",
    path: "/keyDifficultPoints/studentLearning/0",
    description: "改写学生学习视角下的关键动作或学习障碍。",
    read: (lesson) => readTextBlock(lesson.keyDifficultPoints.studentLearning),
  },
  {
    group: "教学重难点",
    label: "教学内容重难点",
    path: "/keyDifficultPoints/teachingContent/0",
    description: "改写教学内容本身的技术重点和难点。",
    read: (lesson) => readTextBlock(lesson.keyDifficultPoints.teachingContent),
  },
  {
    group: "评价",
    label: "三颗星评价",
    path: "/evaluation/0/description",
    description: "改写最高达成等级的评价标准。",
    read: (lesson) => lesson.evaluation[0]?.description ?? "",
  },
  {
    group: "评价",
    label: "二颗星评价",
    path: "/evaluation/1/description",
    description: "改写中等达成等级的评价标准。",
    read: (lesson) => lesson.evaluation[1]?.description ?? "",
  },
  {
    group: "评价",
    label: "一颗星评价",
    path: "/evaluation/2/description",
    description: "改写基础达成等级的评价标准。",
    read: (lesson) => lesson.evaluation[2]?.description ?? "",
  },
  {
    group: "安全",
    label: "安全保障第一条",
    path: "/periodPlan/safety/0",
    description: "改写课时计划表中的安全保障提示。",
    read: (lesson) => lesson.periodPlan.safety[0] ?? "",
  },
  {
    group: "课堂流程",
    label: "准备部分教学内容",
    path: "/periodPlan/rows/0/content/0",
    description: "改写准备部分第一条具体教学内容。",
    read: (lesson) => lesson.periodPlan.rows[0]?.content[0] ?? "",
  },
  {
    group: "课堂流程",
    label: "基本部分教师指导",
    path: "/periodPlan/rows/1/methods/teacher/0",
    description: "改写基本部分第一条教师指导语。",
    read: (lesson) => lesson.periodPlan.rows[1]?.methods.teacher[0] ?? "",
  },
  {
    group: "课堂流程",
    label: "基本部分学生活动",
    path: "/periodPlan/rows/1/methods/students/0",
    description: "改写基本部分第一条学生活动要求。",
    read: (lesson) => lesson.periodPlan.rows[1]?.methods.students[0] ?? "",
  },
  {
    group: "课堂流程",
    label: "结束部分教学内容",
    path: "/periodPlan/rows/2/content/0",
    description: "改写结束部分第一条具体教学内容。",
    read: (lesson) => lesson.periodPlan.rows[2]?.content[0] ?? "",
  },
  {
    group: "课后作业",
    label: "第一条课后作业",
    path: "/periodPlan/homework/0",
    description: "改写课后作业第一条。",
    read: (lesson) => lesson.periodPlan.homework[0] ?? "",
  },
];

export function getCompetitionLessonEditableField(path: string) {
  return COMPETITION_LESSON_EDITABLE_FIELDS.find((field) => field.path === path);
}
