import type { StandardsRetrievalProvider } from "./provider-types";
import { createLocalScoringStandardsProvider } from "./local_scoring_standards_provider";

let standardsRetrievalProvider: StandardsRetrievalProvider = createLocalScoringStandardsProvider();

export function getStandardsRetrievalProvider() {
  return standardsRetrievalProvider;
}

export function setStandardsRetrievalProvider(provider: StandardsRetrievalProvider) {
  standardsRetrievalProvider = provider;
}

export function resetStandardsRetrievalProvider() {
  standardsRetrievalProvider = createLocalScoringStandardsProvider();
}
