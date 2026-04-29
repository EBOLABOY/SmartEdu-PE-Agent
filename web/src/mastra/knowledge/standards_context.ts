import type { StandardReference } from "./provider-types";

export function buildStandardsContextFromReferences(references: StandardReference[]) {
  if (references.length === 0) {
    return "未检索到匹配的体育课程标准结构化条目，请以目标市场的正式现行课标文本为准。";
  }

  return references
    .map((reference, index) => {
      const requirements = reference.requirements.map((item) => `    - ${item}`).join("\n");
      const implications = reference.teachingImplications.map((item) => `    - ${item}`).join("\n");

      return [
        `${index + 1}. ${reference.title}`,
        `   来源：${reference.citation}`,
        `   学段：${reference.gradeBands.join("、")}；模块：${reference.module}`,
        `   摘要：${reference.summary}`,
        `   课标要求：\n${requirements}`,
        `   教学转化：\n${implications}`,
      ].join("\n");
    })
    .join("\n\n");
}
