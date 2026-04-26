import {
  escapeHtml,
  renderLessonSlideModule,
  renderLoadCurveModule,
  renderTimelineModule,
  resolveLessonSupportModule,
  type LessonSupportModule,
} from "./lesson-screen-modules";
import { renderLessonScreenScript } from "./lesson-screen-script";
import { buildLessonScreenProjectState } from "./lesson-screen-state";
import { renderLessonScreenStyles } from "./lesson-screen-styles";

export type LessonSlide = {
  title: string;
  durationSeconds: number;
  durationLabel: string;
  estimated: boolean;
  content: string[];
  organization: string;
  teacherTip: string;
  studentAction: string;
  safety: string;
  assessment: string;
  boardRequired: boolean;
  supportModule: LessonSupportModule;
  actionSteps: string[];
  selfHelp: string;
};

const DEFAULT_SLIDES: LessonSlide[] = [
  {
    title: "课堂常规",
    durationSeconds: 60,
    durationLabel: "1 分钟",
    estimated: true,
    content: ["集合整队，检查服装与器材，明确本课学习任务。"],
    organization: "四列横队，面向教师。",
    teacherTip: "快速建立课堂秩序，说明安全边界。",
    studentAction: "精神集中，回应口令，完成自查。",
    safety: "鞋带系紧，保持队列间距。",
    assessment: "观察集合速度、精神面貌与规则意识。",
    boardRequired: false,
    supportModule: "formation",
    actionSteps: ["看大屏确认本课任务", "按队形快速集合", "完成服装与器材自查"],
    selfHelp: "不清楚时先看队形与安全卡，再听教师口令。",
  },
  {
    title: "热身活动",
    durationSeconds: 300,
    durationLabel: "5 分钟",
    estimated: true,
    content: ["围绕主要教材进行动态拉伸、专项步伐和低强度唤醒。"],
    organization: "分组散点或绕场行进。",
    teacherTip: "由低到高递增负荷，提示动作幅度。",
    studentAction: "按节奏完成热身，主动调整呼吸。",
    safety: "避免突然冲刺和相互碰撞。",
    assessment: "观察动作到位程度和参与积极性。",
    boardRequired: false,
    supportModule: "formation",
    actionSteps: ["跟随节奏慢启动", "完成动态拉伸", "过渡到专项脚步"],
    selfHelp: "动作犹豫时先看同伴节奏，保持慢速和间距。",
  },
  {
    title: "技能与战术学习",
    durationSeconds: 1_200,
    durationLabel: "20 分钟",
    estimated: true,
    content: ["围绕本课核心技能或战术任务进行讲解、示范、模仿和分层练习。"],
    organization: "小组轮换练习，教师巡回指导。",
    teacherTip: "抓住重难点，用问题引导学生理解动作或配合意图。",
    studentAction: "观察示范，合作练习，及时反馈。",
    safety: "控制练习密度和移动路线，保持安全距离。",
    assessment: "观察技术完成质量、合作意识与战术选择。",
    boardRequired: true,
    supportModule: "tacticalBoard",
    actionSteps: ["先看示范路线", "再按小组慢速试跑", "最后带球或对抗练习"],
    selfHelp: "忘记跑位时看右侧战术板，按编号和箭头完成移动。",
  },
  {
    title: "放松总结",
    durationSeconds: 240,
    durationLabel: "4 分钟",
    estimated: true,
    content: ["拉伸放松，回顾学习目标，完成课堂评价与课后提醒。"],
    organization: "半圆或散点站位，面向教师。",
    teacherTip: "引导学生说出收获、问题和改进方向。",
    studentAction: "调整呼吸，参与总结，完成自评互评。",
    safety: "放松动作缓慢可控，不做弹振拉伸。",
    assessment: "通过提问和自评检查目标达成。",
    boardRequired: false,
    supportModule: "formation",
    actionSteps: ["调整呼吸", "完成主要肌群拉伸", "回答本课关键问题"],
    selfHelp: "拉伸以舒适为准，疼痛或不适立即示意教师。",
  },
];

const STAGE_KEYWORDS = [
  "课堂常规",
  "准备活动",
  "热身",
  "基本部分",
  "技能学习",
  "战术学习",
  "分组练习",
  "比赛",
  "展示",
  "体能",
  "放松",
  "总结",
  "课堂小结",
];

const BOARD_KEYWORDS = /战术|攻防|配合|跑位|阵型|路线|传接球|掩护|突破|防守|轮换|篮球|足球|排球|手球|橄榄球/;

function stripMarkdown(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_#>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toPositiveSeconds(minutes: number) {
  return Math.max(30, Math.round(minutes * 60));
}

function parseDurationSeconds(value: string) {
  const normalized = value.replace(/[－–—~～至到]/g, "-");
  const rangeMatch = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*分/.exec(normalized);

  if (rangeMatch) {
    return toPositiveSeconds((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  }

  const minuteMatch = /(\d+(?:\.\d+)?)\s*(?:分|分钟|min)/i.exec(normalized);

  if (minuteMatch) {
    return toPositiveSeconds(Number(minuteMatch[1]));
  }

  const secondMatch = /(\d+)\s*(?:秒|s)/i.exec(normalized);

  if (secondMatch) {
    return Math.max(30, Number(secondMatch[1]));
  }

  return null;
}

function formatDurationLabel(seconds: number) {
  if (seconds % 60 === 0) {
    return `${seconds / 60} 分钟`;
  }

  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function getLessonTitle(lessonPlan: string) {
  const heading = lessonPlan
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));

  if (!heading) {
    return "体育课学习辅助大屏";
  }

  return stripMarkdown(heading.replace(/^#\s+/, "")) || "体育课学习辅助大屏";
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim();

  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }

  if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed)) {
    return null;
  }

  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => stripMarkdown(cell));
}

function isMarkdownTableLine(line: string) {
  const trimmed = line.trim();

  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function normalizeSlideIdentity(slide: LessonSlide) {
  const stageKeyword = STAGE_KEYWORDS.find((keyword) => slide.title.includes(keyword));
  const normalizedTitle = stageKeyword ?? slide.title.replace(/\s+/g, "");
  const normalizedMinutes = Math.round(slide.durationSeconds / 60);

  return `${normalizedTitle}:${normalizedMinutes}`;
}

function chooseTitle(cells: string[], rowIndex: number) {
  const keywordCell = cells.find((cell) => STAGE_KEYWORDS.some((keyword) => cell.includes(keyword)));

  if (keywordCell) {
    const compact = keywordCell.split(/[。；;，,]/)[0]?.trim();
    return compact || keywordCell;
  }

  const firstUsefulCell = cells.find((cell) => cell && !parseDurationSeconds(cell) && cell.length <= 18);

  return firstUsefulCell || `教学环节 ${rowIndex + 1}`;
}

function createSlideFromCells(cells: string[], rowIndex: number): LessonSlide | null {
  const joined = cells.filter(Boolean).join("；");
  const durationCell = cells.find((cell) => parseDurationSeconds(cell));
  const title = chooseTitle(cells, rowIndex);
  const durationSeconds = durationCell ? parseDurationSeconds(durationCell) : null;
  const hasTeachingSignal = STAGE_KEYWORDS.some((keyword) => joined.includes(keyword)) || Boolean(durationSeconds);

  if (!hasTeachingSignal || joined.length < 8) {
    return null;
  }

  const contentCells = cells.filter((cell) => cell && cell !== durationCell && cell !== title);
  const content = contentCells.length > 0 ? contentCells.slice(0, 4) : [joined];
  const boardRequired = BOARD_KEYWORDS.test(joined);
  const estimatedSeconds = title.includes("常规")
    ? 60
    : title.includes("放松") || title.includes("总结") || title.includes("小结")
      ? 240
      : title.includes("热身") || title.includes("准备")
        ? 300
        : 600;

  return {
    title,
    durationSeconds: durationSeconds ?? estimatedSeconds,
    durationLabel: durationSeconds ? formatDurationLabel(durationSeconds) : formatDurationLabel(estimatedSeconds),
    estimated: !durationSeconds,
    content,
    organization: contentCells.find((cell) => /队|组|散点|圆|场|轮换|横队|纵队/.test(cell)) ?? "按教案组织形式开展。",
    teacherTip: contentCells.find((cell) => /教|示范|讲解|提示|巡回|纠正/.test(cell)) ?? "聚焦本环节重难点，及时提示与纠错。",
    studentAction: contentCells.find((cell) => /学|练|观察|合作|完成|体验/.test(cell)) ?? "按要求观察、练习、合作与反馈。",
    safety: contentCells.find((cell) => /安全|距离|保护|碰撞|强度|负荷/.test(cell)) ?? "保持安全距离，控制动作幅度与练习强度。",
    assessment: contentCells.find((cell) => /评价|观察|达成|表现|反馈|成功/.test(cell)) ?? "观察参与度、动作质量和合作表现。",
    boardRequired,
    supportModule: resolveLessonSupportModule({ title, content, organization: contentCells.join(" "), boardRequired }),
    actionSteps: buildActionSteps(title, contentCells),
    selfHelp: buildSelfHelp(title, joined),
  };
}

function parseTableSlides(lessonPlan: string) {
  const slides: LessonSlide[] = [];
  const rows = lessonPlan.split(/\r?\n/).map(splitMarkdownTableRow).filter((row): row is string[] => Boolean(row));

  rows.forEach((cells, index) => {
    const slide = createSlideFromCells(cells, index);

    if (!slide) {
      return;
    }

    const isDuplicate = slides.some(
      (item) => item.title === slide.title && Math.abs(item.durationSeconds - slide.durationSeconds) < 30,
    );

    if (!isDuplicate) {
      slides.push(slide);
    }
  });

  return slides;
}

function parseLooseSlides(lessonPlan: string) {
  const lines = lessonPlan
    .split(/\r?\n/)
    .filter((line) => !isMarkdownTableLine(line))
    .map((line) => stripMarkdown(line))
    .filter(Boolean);
  const slides: LessonSlide[] = [];

  lines.forEach((line, index) => {
    const keyword = STAGE_KEYWORDS.find((item) => line.includes(item));
    const durationSeconds = parseDurationSeconds(line);

    if (!keyword || !durationSeconds) {
      return;
    }

    const boardRequired = BOARD_KEYWORDS.test(line);

    slides.push({
      title: keyword,
      durationSeconds,
      durationLabel: formatDurationLabel(durationSeconds),
      estimated: false,
      content: [line],
      organization: "按教案要求组织队形与轮换。",
      teacherTip: "明确任务、强调关键动作并巡回指导。",
      studentAction: "按要求完成练习，主动合作与反馈。",
      safety: "保持间距，听从口令，控制练习强度。",
      assessment: "观察动作质量、参与态度和目标达成。",
      boardRequired,
      supportModule: resolveLessonSupportModule({
        title: keyword,
        content: [line],
        organization: "按教案要求组织队形与轮换。",
        boardRequired,
      }),
      actionSteps: buildActionSteps(keyword, [line]),
      selfHelp: buildSelfHelp(keyword, line),
    });

    if (slides.length > 12) {
      lines.splice(index + 1);
    }
  });

  return slides;
}

function takeShortText(value: string, maxLength = 34) {
  const compact = value.replace(/\s+/g, "");

  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function splitTeachingSteps(value: string) {
  return value
    .split(/<br\s*\/?>|[。；;]|(?:\d+[、.．])/i)
    .map((item) => stripMarkdown(item))
    .filter((item) => item.length >= 3)
    .slice(0, 3);
}

function buildActionSteps(title: string, contentCells: string[]) {
  const joined = contentCells.join("。");
  const explicitSteps = splitTeachingSteps(joined);

  if (explicitSteps.length >= 3) {
    return explicitSteps.map((step) => takeShortText(step));
  }

  if (/热身|准备/.test(title)) {
    return ["看清活动区域", "跟随节奏完成热身", "逐步提高动作幅度"];
  }

  if (/战术|攻防|配合|跑位|阵型|路线|传接球/.test(`${title}${joined}`)) {
    return ["观察战术板路线", "无球慢速试跑", "带球或对抗中完成配合"];
  }

  if (/比赛|展示|竞赛/.test(title)) {
    return ["听清规则", "按组轮换参与", "结束后完成互评"];
  }

  if (/放松|总结|小结|结束/.test(title)) {
    return ["降低心率", "完成拉伸", "说出一个收获或问题"];
  }

  return ["看清任务", "按组练习", "根据反馈调整动作"];
}

function buildSelfHelp(title: string, source: string) {
  if (/战术|攻防|配合|跑位|阵型|路线|传接球/.test(`${title}${source}`)) {
    return "看右侧自动跑位：先找自己的编号，再沿箭头完成移动或传球。";
  }

  if (/安全|距离|保护|碰撞|强度|负荷/.test(source)) {
    return "不确定怎么做时，先停一步，确认安全距离后再继续练习。";
  }

  if (/热身|准备/.test(title)) {
    return "跟不上节奏时先放慢速度，保证动作完整和呼吸稳定。";
  }

  if (/放松|总结|小结|结束/.test(title)) {
    return "拉伸只做到轻微牵拉感，借助大屏问题完成自评。";
  }

  return "学习犹豫时先看本页三步行动，再向同伴或教师确认。";
}

export function extractLessonSlides(lessonPlan: string) {
  const parsedSlides = [...parseTableSlides(lessonPlan), ...parseLooseSlides(lessonPlan)];
  const seen = new Set<string>();
  const uniqueSlides = parsedSlides.filter((slide) => {
    const identity = normalizeSlideIdentity(slide);

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });

  if (uniqueSlides.length >= 2) {
    return uniqueSlides.slice(0, 12);
  }

  return DEFAULT_SLIDES;
}

export function isPptStyleLessonHtml(html: string) {
  const slideCount = (html.match(/<section\b[^>]*class=["'][^"']*\bslide\b/gi) ?? []).length;
  const timedSlideCount = (html.match(/data-duration=["']\d+["']/gi) ?? []).length;
  const hasStart = /开始上课|开始课程|开始/.test(html);
  const hasTimer = /倒计时|timer|countdown/i.test(html);
  const hasControls = /上一页|下一页|暂停|继续|重新计时/.test(html);

  return slideCount >= 3 && timedSlideCount >= 2 && hasStart && hasTimer && hasControls;
}

export function buildLessonSlideshowHtml(lessonPlan: string) {
  const title = getLessonTitle(lessonPlan);
  const slides = extractLessonSlides(lessonPlan);
  const state = buildLessonScreenProjectState({ title, lessonText: lessonPlan, slides });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(state.title)}｜课堂学习辅助大屏</title>
  ${renderLessonScreenStyles(state.designSpec)}
</head>
<body>
  <div class="deck">
    <section class="slide cover active" data-duration="0" data-index="0" data-rhythm="anchor" data-theme="${state.designSpec.theme.name}">
      <div class="cover-grid">
        <div>
          <span class="badge">体育课堂学习辅助大屏</span>
          <h1>${escapeHtml(state.title)}</h1>
          <p class="subtitle">这不是讲解型 PPT，而是上课时放在大屏上的行动导航：学生看得见流程、时间、做法和安全边界，教师专注组织与反馈。</p>
          <button class="start-button" type="button" id="startButton">开始上课</button>
        </div>
        <div class="hero-card">
          <h2>课堂运行总览</h2>
          <ul class="hero-list">
            <li>全课 ${state.slides.length} 个环节，预计 ${state.totalMinutes} 分钟，自动倒计时推进。</li>
            <li>每页按便当网格拆成任务、三步行动、安全与评价卡片。</li>
            <li>${state.boardCount > 0 ? `${state.boardCount} 个环节配备自动跑位战术板，学生可看屏自学。` : "无战术环节时突出组织队形、行动步骤和自助提示。"}</li>
          </ul>
          <div class="timeline">${renderTimelineModule(state.slides)}</div>
          ${renderLoadCurveModule(state.loadCurvePoints)}
        </div>
      </div>
    </section>
    ${state.slides.map((slide, index) => renderLessonSlideModule(slide, index + 1, state.slides.length, state.designSpec.rhythm[`P${String(index + 1).padStart(2, "0")}`] ?? "dense")).join("")}
    <div class="controls">
      <button type="button" id="prevButton">上一页</button>
      <button type="button" class="primary" id="toggleButton">暂停</button>
      <button type="button" id="resetButton">重新计时</button>
      <span class="page-indicator" id="pageIndicator">准备开始</span>
      <button type="button" id="nextButton">下一页</button>
    </div>
    <div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
  </div>
  ${renderLessonScreenScript(state.slideData)}
</body>
</html>`;
}

