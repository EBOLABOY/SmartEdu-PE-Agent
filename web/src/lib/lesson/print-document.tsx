import { renderToStaticMarkup } from "react-dom/server";

import CompetitionLessonPrintView from "@/components/lesson-print/CompetitionLessonPrintView";
import type { CompetitionLessonPlan } from "@/lib/lesson/contract";

const COMPETITION_LESSON_PRINT_CSS = `
  :root {
    --competition-print-ink: #111;
    --competition-print-border: #111;
    --competition-print-paper: #fff;
    --competition-print-page-width: 210mm;
    --competition-print-page-min-height: 297mm;
    --competition-print-page-padding-y: 12mm;
    --competition-print-page-padding-x: 14mm;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  html,
  body {
    margin: 0;
    min-height: 100%;
    background: #e2e8f0;
    color: var(--competition-print-ink);
    font-family: "SimSun", "Songti SC", "Microsoft YaHei", sans-serif;
  }

  .competition-print-root {
    width: var(--competition-print-page-width);
    margin: 16px auto;
    color: var(--competition-print-ink);
    font-family: "SimSun", "Songti SC", "Microsoft YaHei", sans-serif;
  }

  .competition-print-page {
    width: var(--competition-print-page-width);
    min-height: var(--competition-print-page-min-height);
    margin: 0 auto;
    padding: var(--competition-print-page-padding-y) var(--competition-print-page-padding-x);
    background: var(--competition-print-paper);
    box-shadow: 0 18px 45px rgb(15 23 42 / 18%);
  }

  .competition-print-header {
    margin-bottom: 35px;
  }

  .competition-print-header h2 {
    margin: 0 0 10px;
    text-align: center;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.6;
    letter-spacing: 2px;
  }

  .competition-print-subtitle-level {
    margin-bottom: 15px;
    text-align: right;
    font-size: 16px;
    line-height: 1.6;
    text-indent: 0;
  }

  .competition-print-subtitle-teacher {
    text-align: center;
    font-size: 14px;
    line-height: 1.6;
  }

  .competition-print-subtitle-teacher span {
    margin: 0 15px;
  }

  .competition-print-section {
    margin-top: 25px;
  }

  .competition-print-section-title {
    margin: 0 0 10px;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.6;
  }

  .competition-print-paragraph,
  .competition-print-numbered p {
    margin: 0 0 10px;
    text-align: justify;
    font-size: 14px;
    line-height: 1.6;
    text-indent: 2em;
  }

  .competition-print-numbered p {
    text-indent: 0;
  }

  .competition-print-flow {
    margin: 20px 0;
    text-align: center;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.6;
    text-indent: 0;
  }

  .competition-print-table {
    width: 100%;
    margin: 15px 0 25px;
    border-collapse: collapse;
    table-layout: fixed;
    color: var(--competition-print-ink);
    font-family: "SimSun", "Songti SC", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.6;
  }

  .competition-print-table th,
  .competition-print-table td {
    border: 1px solid var(--competition-print-border);
    padding: 8px;
    vertical-align: top;
    word-wrap: break-word;
  }

  .competition-print-table th {
    text-align: center;
    font-weight: 400;
  }

  .competition-print-eval-table th {
    padding: 12px;
  }

  .competition-print-eval-level-col {
    width: 13%;
  }

  .competition-print-eval-table td {
    padding: 15px 18px;
    vertical-align: middle;
    line-height: 2.2;
  }

  .competition-print-eval-table th:first-child,
  .competition-print-eval-table td:first-child {
    width: 13%;
    padding-right: 14px;
    padding-left: 14px;
    white-space: nowrap;
  }

  .competition-print-eval-level-cell {
    position: relative;
    text-align: center;
    vertical-align: middle !important;
  }

  .competition-print-eval-level-text {
    position: relative;
    z-index: 1;
    display: inline-block;
    min-width: 4.25em;
    background: var(--competition-print-paper);
    line-height: 1.5;
    letter-spacing: 0.02em;
    text-align: center;
  }

  .competition-print-eval-table td:last-child {
    text-align: justify;
  }

  .competition-print-lesson-table td {
    padding: 8px;
  }

  .competition-print-center {
    text-align: center;
    vertical-align: middle;
  }

  .competition-print-col-title {
    background-color: #fafafa;
    text-align: center;
    vertical-align: middle !important;
    font-weight: 700;
  }

  .competition-print-compact-line,
  .competition-print-organization-note {
    margin: 0 0 4px;
    line-height: 1.6;
    text-indent: 0;
  }

  .competition-print-teaching-content-line {
    margin-bottom: 8px;
  }

  .competition-print-teaching-content-heading {
    display: block;
    margin-bottom: 2px;
    font-weight: 700;
    line-height: 1.45;
  }

  .competition-print-method-label {
    margin: 0 0 4px;
    font-weight: 700;
    line-height: 1.6;
    text-indent: 0;
  }

  .competition-print-row-title,
  .competition-print-vertical-cell {
    vertical-align: middle !important;
    font-weight: 700;
    line-height: 1.15;
  }

  .competition-print-row-title span,
  .competition-print-vertical-cell span {
    display: block;
  }

  .competition-print-diagram-box {
    margin-bottom: 15px;
    text-align: center;
  }

  .competition-print-diagram-title {
    margin-bottom: 4px;
    color: #333;
    font-size: 12px;
    line-height: 1.2;
  }

  .competition-print-ai-diagram {
    margin-bottom: 10px;
    text-align: center;
  }

  .competition-print-ai-diagram-image {
    display: block;
    width: 100%;
    min-height: 96px;
    max-height: 130px;
    object-fit: contain;
    border: 1px solid #d4d4d4;
    border-radius: 4px;
    background: #fff;
  }

  .competition-print-ai-diagram-fallback {
    box-sizing: border-box;
    width: 100%;
    min-height: 96px;
    padding: 6px;
    overflow: hidden;
    background: #fff;
  }

  .competition-print-ai-diagram-fallback .competition-print-diagram-box {
    margin-bottom: 6px;
  }

  .competition-print-ai-diagram-fallback .competition-print-field-box {
    height: 52px !important;
  }

  .competition-print-ai-diagram-fallback-title {
    margin: 0 0 5px;
    color: #666;
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    text-indent: 0;
  }

  .competition-print-ai-diagram-caption {
    margin: 4px 0 0;
    color: #333;
    font-size: 11px;
    line-height: 1.3;
    text-align: center;
    text-indent: 0;
  }

  .competition-print-formation-grid {
    margin-bottom: 10px;
    line-height: 1.1;
  }

  .competition-print-dot-student {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin: 2px 4px;
    border-radius: 50%;
    background-color: #4a90e2;
  }

  .competition-print-dot-student-sm {
    position: absolute;
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #fff;
    box-shadow: 1px 1px 2px rgb(0 0 0 / 40%);
  }

  .competition-print-dot-teacher {
    position: relative;
    display: inline-block;
    width: 16px;
    height: 16px;
    margin-top: 6px;
    border-radius: 50%;
    background-color: #f5a623;
  }

  .competition-print-dot-teacher::before,
  .competition-print-dot-teacher::after {
    position: absolute;
    top: 4px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #fff;
    content: "";
  }

  .competition-print-dot-teacher::before {
    left: 3px;
  }

  .competition-print-dot-teacher::after {
    right: 3px;
  }

  .competition-print-dot-teacher-smile {
    position: absolute;
    bottom: 3px;
    left: 4px;
    width: 8px;
    height: 4px;
    border-bottom: 2px solid #fff;
    border-radius: 0 0 10px 10px;
  }

  .competition-print-field-box {
    position: relative;
    box-sizing: border-box;
    width: 95%;
    margin: 0 auto;
    border: 2px solid #fff;
    outline: 1px solid #ccc;
    background-color: #6fb96f;
  }

  .competition-print-field-line {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid rgb(255 255 255 / 70%);
  }

  .competition-print-field-center {
    top: 0;
    bottom: 0;
    left: 50%;
    border-left: 2px solid rgb(255 255 255 / 70%);
    transform: translateX(-50%);
  }

  .competition-print-field-circle {
    top: 50%;
    left: 50%;
    width: 30px;
    height: 30px;
    border: 2px solid rgb(255 255 255 / 70%);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .competition-print-field-penalty-left {
    top: 20%;
    bottom: 20%;
    left: 0;
    width: 15px;
    border-left: none;
  }

  .competition-print-field-penalty-right {
    top: 20%;
    right: 0;
    bottom: 20%;
    width: 15px;
    border-right: none;
  }

  .competition-print-load-cell {
    padding: 0 !important;
  }

  .competition-print-load-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 10px;
  }

  .competition-print-load-chart {
    position: relative;
    flex: 0 0 65%;
    height: 110px;
  }

  .competition-print-load-chart svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .competition-print-load-stats {
    flex: 0 0 32%;
    border-left: 1px dashed #ccc;
    padding-left: 15px;
    text-align: center;
  }

  .competition-print-stat-value {
    margin-bottom: 2px;
    color: #d32f2f;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.2;
  }

  .competition-print-stat-label {
    margin-bottom: 10px;
    color: #666;
    font-size: 12px;
  }

  .competition-print-density-badges {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }

  .competition-print-density-badge {
    display: inline-block;
    width: fit-content;
    border-radius: 4px;
    background-color: #e3f2fd;
    color: #1976d2;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 700;
  }

  .competition-print-density-badge-individual {
    background-color: #e8f5e9;
    color: #2e7d32;
  }

  .competition-print-reflection-title {
    height: 45px;
  }

  .competition-print-reflection {
    min-height: 45px;
  }

  @media print {
    @page {
      size: A4 portrait;
      margin: 0;
    }

    html,
    body {
      background: #fff !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .competition-print-root {
      width: var(--competition-print-page-width);
      margin: 0;
    }

    .competition-print-page {
      width: var(--competition-print-page-width);
      min-height: var(--competition-print-page-min-height);
      margin: 0;
      padding: var(--competition-print-page-padding-y) var(--competition-print-page-padding-x);
      box-shadow: none;
    }

    .competition-print-table tr,
    .competition-print-section {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

function escapeHtmlText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCompetitionLessonPrintHtml(lesson: CompetitionLessonPlan) {
  const documentBody = renderToStaticMarkup(<CompetitionLessonPrintView lesson={lesson} />);
  const title = `${lesson.title}｜正式打印版`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlText(title)}</title>
  <style>${COMPETITION_LESSON_PRINT_CSS}</style>
</head>
<body>
  ${documentBody}
</body>
</html>`;
}
