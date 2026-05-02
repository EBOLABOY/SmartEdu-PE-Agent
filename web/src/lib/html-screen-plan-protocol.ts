import { z } from "zod";

import {
  htmlScreenPlanSchema,
  type HtmlScreenPlan,
  type HtmlScreenSectionPlan,
} from "@/lib/html-screen-plan-contract";

const nonEmptyString = z.string().trim().min(1);

type ProtocolBlock =
  | { kind: "none" }
  | { kind: "visualSystem" }
  | { kind: "section"; index: number }
  | { kind: "unknown"; name: string };

export type HtmlScreenPlanProtocolDiagnostic = {
  code: "missing-required" | "unknown-block" | "invalid-value";
  line?: number;
  message: string;
};

export class HtmlScreenPlanProtocolError extends Error {
  readonly diagnostics: HtmlScreenPlanProtocolDiagnostic[];

  constructor(diagnostics: HtmlScreenPlanProtocolDiagnostic[]) {
    super(formatHtmlScreenPlanProtocolDiagnostics({ diagnostics }));
    this.name = "HtmlScreenPlanProtocolError";
    this.diagnostics = diagnostics;
  }
}

const htmlScreenPlanProtocolDraftSchema = z.object({
  sections: z.array(
    z.object({
      durationSeconds: z.number().int().positive().optional(),
      evaluationCue: nonEmptyString.optional(),
      imagePrompt: nonEmptyString.optional(),
      objective: nonEmptyString.optional(),
      pagePrompt: nonEmptyString.optional(),
      pageRole: nonEmptyString.optional(),
      reason: nonEmptyString.optional(),
      safetyCue: nonEmptyString.optional(),
      sourceRowIndex: z.number().int().nonnegative().optional(),
      sourceRowIndexes: z.array(z.number().int().nonnegative()).optional(),
      studentActions: z.array(nonEmptyString).default([]),
      title: nonEmptyString.optional(),
      visualIntent: nonEmptyString.optional(),
      visualMode: nonEmptyString.optional(),
    }),
  ),
  visualSystem: z.array(nonEmptyString).default([]),
  warnings: z.array(z.string()).default([]),
});

type HtmlScreenPlanProtocolDraft = z.infer<typeof htmlScreenPlanProtocolDraftSchema>;
type HtmlSectionDraft = HtmlScreenPlanProtocolDraft["sections"][number];

const KEY_ALIASES: Record<string, string> = {
  "duration": "durationSeconds",
  "duration_seconds": "durationSeconds",
  "evaluation": "evaluationCue",
  "evaluation_cue": "evaluationCue",
  "image_prompt": "imagePrompt",
  "objective": "objective",
  "page_prompt": "pagePrompt",
  "page_role": "pageRole",
  "reason": "reason",
  "role": "pageRole",
  "safety": "safetyCue",
  "safety_cue": "safetyCue",
  "source_row_index": "sourceRowIndex",
  "source_row_indexes": "sourceRowIndexes",
  "student_actions": "studentActions",
  "students": "studentActions",
  "title": "title",
  "visual_intent": "visualIntent",
  "visual_mode": "visualMode",
  "中文标题": "title",
  "动作图提示词": "imagePrompt",
  "媒介": "visualMode",
  "学生行动": "studentActions",
  "安全提醒": "safetyCue",
  "时长": "durationSeconds",
  "标题": "title",
  "来源行": "sourceRowIndex",
  "来源行组": "sourceRowIndexes",
  "理由": "reason",
  "画面提示词": "pagePrompt",
  "视觉意图": "visualIntent",
  "角色": "pageRole",
  "评价观察": "evaluationCue",
  "页面提示词": "pagePrompt",
};

const PAGE_ROLE_ALIASES: Record<string, HtmlScreenSectionPlan["pageRole"]> = {
  "competition": "competition",
  "cooldown": "cooldown",
  "cover": "cover",
  "fitness": "fitness",
  "learnpractice": "learnPractice",
  "learn_practice": "learnPractice",
  "other": "other",
  "summary": "summary",
  "warmup": "warmup",
  "体能": "fitness",
  "其它": "other",
  "其他": "other",
  "冷身": "cooldown",
  "学练": "learnPractice",
  "学练页": "learnPractice",
  "总结": "summary",
  "放松": "cooldown",
  "比赛": "competition",
  "热身": "warmup",
  "首页": "cover",
  "封面": "cover",
};

const VISUAL_MODE_ALIASES: Record<string, HtmlScreenSectionPlan["visualMode"]> = {
  "html": "html",
  "hybrid": "hybrid",
  "image": "image",
  "图文": "hybrid",
  "图片": "image",
  "混合": "hybrid",
  "生图": "image",
  "网页": "html",
};

function createEmptyDraft(): HtmlScreenPlanProtocolDraft {
  return {
    sections: [],
    visualSystem: [],
    warnings: [],
  };
}

function compactText(value: string) {
  return value.replace(/\u3000/g, " ").trim();
}

function stripListMarker(value: string) {
  return compactText(value).replace(/^[-*•]\s*/, "").replace(/^\d+[.、)]\s*/, "").trim();
}

function pushText(target: string[], value: string) {
  const normalized = stripListMarker(value);

  if (normalized) {
    target.push(normalized);
  }
}

function normalizeKey(key: string) {
  const normalized = compactText(key).replace(/\s+/g, "_").toLowerCase();

  return KEY_ALIASES[normalized] ?? KEY_ALIASES[compactText(key)] ?? normalized;
}

function parseKeyValue(line: string) {
  const match = /^([^=：:]+)\s*(?:=|：|:)\s*(.*)$/.exec(line);

  if (!match) {
    return undefined;
  }

  return {
    key: normalizeKey(match[1]),
    value: compactText(match[2]),
  };
}

function parseBlock(line: string): ProtocolBlock | undefined {
  const match = /^@([a-zA-Z_][\w-]*)(?:\s+.*)?$/.exec(line);

  if (!match) {
    return undefined;
  }

  const name = match[1].toLowerCase();

  if (name === "visual_system" || name === "visualsystem") {
    return { kind: "visualSystem" };
  }

  if (name === "section" || name === "screen" || name === "page") {
    return { kind: "section", index: -1 };
  }

  return { kind: "unknown", name };
}

function ensureSection(draft: HtmlScreenPlanProtocolDraft, index: number) {
  draft.sections[index] ??= {
    studentActions: [],
  };

  return draft.sections[index];
}

function parseInteger(value: string) {
  const match = /\d+/.exec(value.replace(/[,，]/g, ""));

  return match ? Number.parseInt(match[0], 10) : undefined;
}

function parseIndexList(value: string) {
  return value
    .split(/[、,，\s]+/)
    .map((item) => parseInteger(item))
    .filter((item): item is number => item !== undefined && item >= 0);
}

function splitTextList(value: string) {
  return value
    .split(/[；;|]/)
    .map(stripListMarker)
    .filter(Boolean);
}

function normalizePageRole(value?: string) {
  const normalized = compactText(value ?? "").replace(/\s+/g, "_").toLowerCase();

  return PAGE_ROLE_ALIASES[normalized] ?? PAGE_ROLE_ALIASES[compactText(value ?? "")];
}

function normalizeVisualMode(value?: string) {
  const normalized = compactText(value ?? "").replace(/\s+/g, "_").toLowerCase();

  return VISUAL_MODE_ALIASES[normalized] ?? VISUAL_MODE_ALIASES[compactText(value ?? "")];
}

function setSectionText(section: HtmlSectionDraft, key: keyof HtmlSectionDraft, value: string) {
  const normalized = compactText(value);

  if (normalized) {
    section[key] = normalized as never;
  }
}

function applyKeyValue(section: HtmlSectionDraft, key: string, value: string) {
  if (!value) {
    return;
  }

  if (key === "durationSeconds") {
    const durationSeconds = parseInteger(value);

    if (durationSeconds) {
      section.durationSeconds = durationSeconds;
    }
    return;
  }

  if (key === "sourceRowIndex") {
    const sourceRowIndex = parseInteger(value);

    if (sourceRowIndex !== undefined) {
      section.sourceRowIndex = sourceRowIndex;
    }
    return;
  }

  if (key === "sourceRowIndexes") {
    const sourceRowIndexes = parseIndexList(value);

    if (sourceRowIndexes.length > 0) {
      section.sourceRowIndexes = sourceRowIndexes;
    }
    return;
  }

  if (key === "studentActions") {
    section.studentActions.push(...splitTextList(value));
    return;
  }

  if (
    key === "evaluationCue" ||
    key === "imagePrompt" ||
    key === "objective" ||
    key === "pagePrompt" ||
    key === "pageRole" ||
    key === "reason" ||
    key === "safetyCue" ||
    key === "title" ||
    key === "visualIntent" ||
    key === "visualMode"
  ) {
    setSectionText(section, key, value);
  }
}

function appendBodyLine(draft: HtmlScreenPlanProtocolDraft, block: ProtocolBlock, line: string) {
  if (block.kind === "visualSystem") {
    pushText(draft.visualSystem, line);
    return;
  }

  if (block.kind === "section") {
    const section = ensureSection(draft, block.index);
    section.pagePrompt = [section.pagePrompt, stripListMarker(line)].filter(Boolean).join("\n");
  }
}

function collectDiagnostics(draft: HtmlScreenPlanProtocolDraft) {
  const diagnostics: HtmlScreenPlanProtocolDiagnostic[] = [];

  if (draft.visualSystem.length === 0) {
    diagnostics.push({
      code: "missing-required",
      message: "HTML 分镜协议缺少 @visual_system。",
    });
  }

  if (draft.sections.length === 0) {
    diagnostics.push({
      code: "missing-required",
      message: "HTML 分镜协议缺少 @section。",
    });
  }

  draft.sections.forEach((section, index) => {
    if (!section.title) {
      diagnostics.push({
        code: "missing-required",
        message: `HTML 分镜协议第 ${index + 1} 个 @section 缺少 title。`,
      });
    }

    if (!section.pagePrompt) {
      diagnostics.push({
        code: "missing-required",
        message: `HTML 分镜协议第 ${index + 1} 个 @section 缺少 page_prompt。`,
      });
    }
  });

  if (draft.sections[0] && normalizePageRole(draft.sections[0].pageRole) !== "cover") {
    diagnostics.push({
      code: "invalid-value",
      message: "HTML 分镜协议第 1 个 @section 必须是 page_role=cover。",
    });
  }

  return diagnostics;
}

export function formatHtmlScreenPlanProtocolDiagnostics(error: {
  diagnostics?: HtmlScreenPlanProtocolDiagnostic[];
}) {
  const diagnostics = error.diagnostics ?? [];

  if (diagnostics.length === 0) {
    return "HTML 分镜协议解析失败。";
  }

  return diagnostics
    .map((diagnostic, index) => {
      const line = diagnostic.line ? `第 ${diagnostic.line} 行：` : "";
      return `${index + 1}. ${line}${diagnostic.message}`;
    })
    .join("\n");
}

export function parseHtmlScreenPlanProtocolText(text: string): HtmlScreenPlanProtocolDraft {
  const draft = createEmptyDraft();
  let block: ProtocolBlock = { kind: "none" };
  let sectionIndex = -1;
  const diagnostics: HtmlScreenPlanProtocolDiagnostic[] = [];

  text.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const line = compactText(rawLine);

    if (!line || line.startsWith("#") || line.startsWith("//")) {
      return;
    }

    const nextBlock = parseBlock(line);

    if (nextBlock) {
      if (nextBlock.kind === "section") {
        sectionIndex += 1;
        block = { kind: "section", index: sectionIndex };
        ensureSection(draft, sectionIndex);
        return;
      }

      block = nextBlock;

      if (nextBlock.kind === "unknown") {
        diagnostics.push({
          code: "unknown-block",
          line: lineIndex + 1,
          message: `HTML 分镜协议存在未知块 @${nextBlock.name}，系统已忽略。`,
        });
      }
      return;
    }

    const keyValue = parseKeyValue(line);

    if (keyValue && block.kind === "section") {
      applyKeyValue(ensureSection(draft, block.index), keyValue.key, keyValue.value);
      return;
    }

    appendBodyLine(draft, block, line);
  });

  draft.warnings = diagnostics.map((diagnostic) => diagnostic.message);

  return htmlScreenPlanProtocolDraftSchema.parse(draft);
}

export function normalizeHtmlScreenPlanProtocolDraft(draft: HtmlScreenPlanProtocolDraft): HtmlScreenPlan {
  const diagnostics = collectDiagnostics(draft);

  if (diagnostics.length > 0) {
    throw new HtmlScreenPlanProtocolError(diagnostics);
  }

  return htmlScreenPlanSchema.parse({
    visualSystem: draft.visualSystem.join("\n"),
    sections: draft.sections.map((section) => {
      const pageRole = normalizePageRole(section.pageRole);
      const visualMode = normalizeVisualMode(section.visualMode);

      return {
        ...(section.durationSeconds ? { durationSeconds: section.durationSeconds } : {}),
        ...(section.evaluationCue ? { evaluationCue: section.evaluationCue } : {}),
        ...(section.imagePrompt && visualMode !== "html" ? { imagePrompt: section.imagePrompt } : {}),
        ...(section.objective ? { objective: section.objective } : {}),
        pagePrompt: section.pagePrompt,
        ...(pageRole ? { pageRole } : {}),
        ...(section.reason ? { reason: section.reason } : {}),
        ...(section.safetyCue ? { safetyCue: section.safetyCue } : {}),
        ...(section.sourceRowIndex !== undefined ? { sourceRowIndex: section.sourceRowIndex } : {}),
        ...(section.sourceRowIndexes?.length ? { sourceRowIndexes: section.sourceRowIndexes } : {}),
        ...(section.studentActions.length ? { studentActions: section.studentActions } : {}),
        title: section.title,
        ...(section.visualIntent ? { visualIntent: section.visualIntent } : {}),
        ...(visualMode ? { visualMode } : {}),
      };
    }),
  });
}

export function parseHtmlScreenPlanProtocolToHtmlScreenPlan(text: string): HtmlScreenPlan {
  return normalizeHtmlScreenPlanProtocolDraft(parseHtmlScreenPlanProtocolText(text));
}
