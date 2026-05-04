import type { TextbookReference } from "./provider-types";

function formatList(items: string[]) {
  const unique = [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, 4);

  return unique.length > 0 ? unique.map((item) => `    - ${item}`).join("\n") : "    - 未提取到结构化条目。";
}

export function buildTextbookContextFromReferences(references: TextbookReference[]) {
  if (references.length === 0) {
    return "未检索到匹配的教材正文条目；教材分析请基于课程主题、学生学情和体育教学规律生成，教材出处仅使用系统实际提供的来源。";
  }

  return references
    .map((reference, index) => {
      return [
        `${index + 1}. ${reference.title}`,
        `   来源：${reference.citation}`,
        `   版本：${reference.publisher}；册次：${reference.edition ?? "未标注"}；年级/水平：${reference.grade ?? reference.level ?? "未标注"}`,
        `   模块：${reference.module}；类型：${reference.sourceKind}`,
        `   摘要：${reference.summary}`,
        `   教材分析线索：\n${formatList(reference.teachingAnalysis)}`,
        `   动作/技术要点：\n${formatList(reference.technicalPoints)}`,
        `   教学实施建议：\n${formatList(reference.teachingSuggestions)}`,
        `   安全提示：\n${formatList(reference.safetyNotes)}`,
      ].join("\n");
    })
    .join("\n\n");
}
