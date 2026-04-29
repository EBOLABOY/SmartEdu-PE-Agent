import { DEFAULT_STANDARDS_MARKET, type StandardsMarket } from "@/lib/lesson-authoring-contract";

export type ResolvedStandardsMarketMetadata = {
  requestedMarket: StandardsMarket;
  resolvedMarket: StandardsMarket;
  warning?: string;
};

export function resolveStandardsMarketMetadata(
  market = DEFAULT_STANDARDS_MARKET,
): ResolvedStandardsMarketMetadata {
  if (market === "us-shape-k12") {
    return {
      requestedMarket: market,
      resolvedMarket: DEFAULT_STANDARDS_MARKET,
      warning:
        "当前仓库尚未接入 SHAPE 体育标准知识库，已自动回退到中国《义务教育体育与健康课程标准（2022年版）》结构化语料。",
    };
  }

  return {
    requestedMarket: market,
    resolvedMarket: market,
  };
}
