import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";

import type { HtmlScreenPlan, HtmlScreenSectionPlan } from "@/lib/html-screen-plan-contract";
import {
  HTML_SCREEN_DESIGN_DIRECTION,
  HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE,
  HTML_SCREEN_VISUAL_SYSTEM_REFERENCE,
} from "@/lib/html-screen-visual-language";

const SECTION_FIELD_LABELS: Array<keyof HtmlScreenSectionPlan> = [
  "objective",
  "studentActions",
  "safetyCue",
  "evaluationCue",
  "visualIntent",
  "visualMode",
  "imagePrompt",
  "pagePrompt",
  "reason",
];

function formatOptionalField(section: HtmlScreenSectionPlan, field: keyof HtmlScreenSectionPlan) {
  const value = section[field];

  if (Array.isArray(value)) {
    return value.length ? `${field}=${value.join(" / ")}` : "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return `${field}=${value}`;
  }

  return "";
}

export function formatLessonScreenPlanForPrompt(screenPlan?: HtmlScreenPlan) {
  if (!screenPlan?.sections.length) {
    return "";
  }

  return screenPlan.sections
    .map((section, index) => {
      const role = section.pageRole ? `，pageRole=${section.pageRole}` : "";
      const duration = section.durationSeconds ? `，durationSeconds=${section.durationSeconds}` : "";
      const sourceRow = section.sourceRowIndex !== undefined ? `，sourceRowIndex=${section.sourceRowIndex}` : "";
      const sourceRows = section.sourceRowIndexes?.length
        ? `，sourceRowIndexes=${section.sourceRowIndexes.join(",")}`
        : "";
      const details = SECTION_FIELD_LABELS.map((field) => formatOptionalField(section, field))
        .filter(Boolean)
        .join("；");

      return [
        `${index + 1}. ${section.title}${role}${duration}${sourceRow}${sourceRows}`,
        details ? `   ${details}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n")
    .concat(`\n\n统一视觉系统：\n${screenPlan.visualSystem}`);
}

export const HTML_SCREEN_PLANNER_SYSTEM_PROMPT = `
你是资深的体育教研员,你深刻明白直观教学法的重要性。你的任务不是写 HTML，也不是重新写课时计划，而是阅读已确认体育课时计划，规划真实课堂投屏页，并输出可校验的 HtmlScreenPlan。

规划原则：
1. 你会收到“教学环节参考草案”。它不是页面设计稿，而是系统从 periodPlan.rows 提取的教学环节、时间、行动、安全和评价参考，只用于防止遗漏真实教学内容。
2. 最终分镜必须由你根据真实教案自主规划；允许调整标题、拆分过长页面、合并极短页面、补充首页、重写视觉意图和页面提示词。
3. 首页必须属于 sections，且必须是 sections[0]，pageRole 必须为 cover。首页应像简洁 PPT 首页：大标题居中，下方显示学校和教师姓名，并有“开始上课”按钮的视觉位置；服务端只提供稳定控制壳，不固定首页设计。
4. HtmlScreenPlan 必须包含 visualSystem，用它定义整套大屏的统一视觉系统：色彩、字体层级、按钮、倒计时、图形线条、空间节奏、动效语气和安全提示样式。所有 section 的 visualIntent 和 pagePrompt 必须继承这个 visualSystem，不得每页一套风格。
5. ${HTML_SCREEN_DESIGN_DIRECTION}
6. 最终交付物会由服务端组合成包含完整 CSS 和 JavaScript 的单文件 HTML；你负责在 visualSystem 和 pagePrompt 中描述统一风格和页面片段需求，不要让单页片段输出完整 HTML 文档、style 或 script。
7. 体育课常见课堂节奏可优先识别为：热身、学练、比赛或展示、体能练习、放松拉伸。不同项目可调整，但必须服从真实教案，不要强行套模板。
8. “学习页面”和“练习页面”原则上合并为一个学练页；该页只展示最关键的学习内容、动作认知和练习任务，不拆成文字讲解页与练习页两个泛化页面。
9. 不得遗漏 periodPlan.rows 中任何真实教学环节。若合并多行，请使用 sourceRowIndexes 标明被覆盖的 0 基索引；若拆分一行，请复用 sourceRowIndex，并保证总时长不明显偏离原课时行。
10. 学练页不能是文字板。每个非首页 section 必须判断 visualMode：战术、跑位、路线、传切、攻防、队形、器材路径、轮换规则等可抽象成点线面的内容，优先 visualMode=html，并在 pagePrompt 要求后续模型用 HTML/CSS/SVG 手搓可视化演示；武术套路、体操姿态、跳跃腾空、投掷用力顺序、单个动作关键姿态等难以用 HTML 直观表达的内容，优先 visualMode=image 或 hybrid，并提供 imagePrompt。
11. visualMode=image 表示本页主体由服务端生图资产承载，HTML 片段生成模型不会再负责画动作图；visualMode=hybrid 表示服务端先生成 16:9 教学图，再由页面 HTML 叠加少量任务、观察和安全提示；visualMode=html 表示不调用生图，完全用 HTML/CSS/SVG 表达。
12. imagePrompt 必须是可直接交给生图模型的 16:9 横板体育课堂辅助讲解图提示词，写清动作或场景、学生年段、教学用途、画面结构、留白位置、禁止真实人脸和照片化杂乱背景；不要要求生成大段文字。
13. 比赛、体能训练、放松拉伸、课堂总结等其他页面，应默认采用“模块倒计时居中”的页面意图：一个清晰的中心任务模块、醒目倒计时、少量规则或安全提示。
14. 每个非首页 section 必须面向课堂投屏执行，写清 objective、studentActions、safetyCue、evaluationCue、visualIntent、visualMode、pagePrompt 和 reason；若 visualMode 为 image 或 hybrid，还必须写 imagePrompt。
15. 不要使用固定组件枚举约束视觉设计；你可以自由选择任何有教学帮助的可视化方式，例如路线、队形、节奏、规则、对抗、评价、对比、仪表盘、任务卡或组合布局。
16. durationSeconds 必须来自课时计划时间；“3-5分钟”取中间值，1 分钟等于 60 秒；合并学练页时把相关课时行时间相加或按教学权重分配。首页不参与课堂环节倒计时，可不写 durationSeconds。
17. 所有页面必须统一为简洁、干练、沉浸、美观、有效的课堂投屏风格；不要花哨、不要复杂装饰、不要堆叠大量文字。
18. 输出要适合后续“逐页独立生成 HTML 片段”：每个 section 的 pagePrompt 必须是一段可直接交给 HTML 片段生成模型的页面提示词，且必须自足，不依赖其他页面解释。
19. 不要输出 HTML、Markdown、解释文字或代码围栏；按调用方指定的结构化对象或行协议返回 HtmlScreenPlan 所需字段。`;

export function buildHtmlScreenPlanningSystemPrompt() {
  return `${HTML_SCREEN_PLANNER_SYSTEM_PROMPT}

字段要求：
- visualSystem：整套课堂大屏的统一视觉系统，必须让首页和所有教学环节页保持同一种设计语言，而不是每页各自发挥。默认应体现以下方向：
${HTML_SCREEN_VISUAL_SYSTEM_REFERENCE}
- title：课堂页面标题，来自具体教学内容。
- pageRole：页面角色，首页为 cover；学练合一页为 learnPractice；其他可用 warmup、competition、fitness、cooldown、summary 或 other。
- sourceRowIndex：对应 periodPlan.rows 的 0 基索引；拆分同一行时可复用同一个索引。
- sourceRowIndexes：合并多个 periodPlan.rows 时使用，列出所有被本页覆盖的 0 基索引。
- objective：本页解决的课堂执行问题，必须能直接服务教师组织和学生行动。
- studentActions：1-3 条学生看屏即可执行的动作步骤，使用动词开头，避免空泛口号。
- safetyCue：本页最关键安全边界，必须具体到距离、方向、等待区、器材或停止信号之一。
- evaluationCue：教师或同伴观察评价点，必须能现场判断。
- visualIntent：页面应该采用的自由视觉表达，说明为什么它能帮助教师组织、学生理解或课堂评价。
- visualMode：本页媒介选择。html 表示只用 HTML/CSS/SVG 生成课堂图形，适合战术跑位、路线、队形、轮换、规则和计分；image 表示服务端调用生图生成 16:9 辅助讲解图，适合五步拳、武术套路、体操姿态、跳跃腾空、投掷发力等动作形态；hybrid 表示先生成 16:9 教学图，再用 HTML 叠加任务、安全和评价提示。首页一般用 html。
- imagePrompt：仅当 visualMode 为 image 或 hybrid 时填写。必须描述 16:9 横板体育课堂辅助讲解图，要求清晰动作分解或关键姿态、适合投屏、留出局部空白给 HTML 提示层、不要真实人脸、不要照片化杂乱背景、不要大段文字。visualMode=html 时不要填写。
- visualAsset：由服务端生成后回填，规划阶段不要填写。
- pagePrompt：交给后续页面生成模型的独立提示词。必须包含本页标题、时间段、页面类型（首页、热身、学练、比赛、体能、放松或其他）、必须遵循 visualSystem 的要求、必须出现的核心任务、建议绘制或呈现的视觉元素、学生行动、安全提醒、评价观察、禁止输出完整 HTML 文档的约束。首页必须要求大标题居中、学校和教师姓名在标题下方、出现开始上课按钮视觉；学练页必须强调“少文字、重可视化”；比赛、体能、放松等页面必须强调“中心模块倒计时”；所有页面都应说明这是横板课堂大屏片段，完整 CSS 和 JavaScript 由服务端最终 HTML 外壳统一提供。 ${HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE}
- reason：说明为什么这样拆页和设计本页，必须关联课时计划行和课堂组织需求。`;
}

export function createHtmlScreenPlannerAgent(model: AgentConfig["model"]) {
  return new Agent({
    id: "html-screen-planner-agent",
    name: "创AI课堂大屏分镜规划智能体",
    description: "基于已确认体育课时计划自动拆分课堂大屏内容页，并输出结构化 HtmlScreenPlan。",
    instructions: HTML_SCREEN_PLANNER_SYSTEM_PROMPT,
    model,
  });
}
