import type { StandardsMarket } from "@/lib/lesson/authoring-contract";

import { searchStandards } from "../../tools/search_standards";

export type StandardsRetrievalSkillInput = {
  query: string;
  market?: StandardsMarket;
};

export async function runStandardsRetrievalSkill(input: StandardsRetrievalSkillInput) {
  return searchStandards(input.query, {
    market: input.market,
  });
}
