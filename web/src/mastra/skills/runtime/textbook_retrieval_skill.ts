import type { StandardsMarket } from "@/lib/lesson/authoring-contract";

import { searchTextbook } from "../../tools/search_textbook";

export type TextbookRetrievalSkillInput = {
  query: string;
  grade?: string;
  market?: StandardsMarket;
  publisher?: string;
  stage?: string;
};

export async function runTextbookRetrievalSkill(input: TextbookRetrievalSkillInput) {
  return searchTextbook(input.query, {
    grade: input.grade,
    market: input.market,
    publisher: input.publisher,
    stage: input.stage,
  });
}
