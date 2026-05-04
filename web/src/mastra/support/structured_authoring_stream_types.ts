/**
 * structured_authoring_stream_types.ts
 *
 * 结构化创作流适配器的共享常量、类型定义与纯工具函数。
 * 本模块不包含业务逻辑或副作用，仅提供定义与无状态工具。
 */

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 草稿流 trace 更新间隔（每 N 个 chunk 更新一次 trace） */
export const DRAFT_TRACE_UPDATE_INTERVAL = 20;

/** 已知为"终态 running"的 trace step，在流结束时需自动标记为 success */
export const TERMINAL_RUNNING_TRACE_STEPS = new Set([
  "agent-stream-started",
  "generate-lesson-diagrams",
  "stream-html-draft",
  "stream-lesson-draft",
  "validate-lesson-output",
]);

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

import type { StructuredArtifactData } from "@/lib/lesson/authoring-contract";

/** 互动大屏就绪校验结果：成功时携带 artifact，失败时携带错误文本 */
export type ReadyHtmlArtifactValidationResult =
  | {
      artifact: StructuredArtifactData;
      ok: true;
    }
  | {
      errorText: string;
      ok: false;
    };

// ---------------------------------------------------------------------------
// 纯工具函数（无外部依赖、无副作用）
// ---------------------------------------------------------------------------

/** 返回当前时间的 ISO 8601 字符串 */
export function nowIsoString() {
  return new Date().toISOString();
}

/** 移除 HTML 中的注释 */
export function stripHtmlComments(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, "");
}

/** 检查字符串是否包含完整的 HTML 文档结构（DOCTYPE + html + head + body） */
export function hasCompleteHtmlDocumentShell(rawHtml: string) {
  return (
    /<!doctype\s+html\b/i.test(rawHtml) &&
    /<html\b[\s\S]*<\/html>\s*$/i.test(rawHtml) &&
    /<head\b[\s\S]*<\/head>/i.test(rawHtml) &&
    /<body\b[\s\S]*<\/body>/i.test(rawHtml)
  );
}

