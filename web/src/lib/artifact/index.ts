/**
 * @module artifact
 * AI 产物模块的统一入口。将协议适配、HTML 图片改写、浏览器内联
 * 三个子模块统一导出。
 */

// protocol — 产物提取与协议适配
export {
  type ExtractedArtifact,
  extractArtifactFromMessage,
  getMessageReasoningText,
  getMessageText,
  getStructuredArtifactPart,
  getStructuredTracePart,
  lessonContentToPlan,
} from "./protocol";

// image-html-rewriter — HTML 中受控图片 URL 改写
export {
  type RewriteArtifactImageUrlsInput,
  type RewriteArtifactImageUrlsResult,
  rewriteArtifactImageUrlsInHtml,
} from "./image-html-rewriter";

// image-browser-inline — 浏览器端图片内联（data URL）
export {
  type InlineArtifactImagesForBrowserHtmlInput,
  blobToDataUrl,
  fetchArtifactImageAsDataUrl,
  inlineArtifactImagesForBrowserHtml,
} from "./image-browser-inline";