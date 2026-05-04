import { DEFAULT_STANDARDS_MARKET, type StandardsMarket } from "@/lib/lesson/authoring-contract";

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
      resolvedMarket: market,
      warning:
        "当前仓库尚未接入 SHAPE 体育标准知识库，课标检索将保持目标市场并返回空结果，避免伪造回退语料。",
    };
  }

  return {
    requestedMarket: market,
    resolvedMarket: market,
  };
}
