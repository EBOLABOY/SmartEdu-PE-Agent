import type { StandardsRetrievalProvider } from "./provider-types";
import { createSupabaseVectorStandardsProvider } from "./supabase_vector_standards_provider";

let standardsRetrievalProvider: StandardsRetrievalProvider = createSupabaseVectorStandardsProvider();

export function getStandardsRetrievalProvider() {
  return standardsRetrievalProvider;
}

export function setStandardsRetrievalProvider(provider: StandardsRetrievalProvider) {
  standardsRetrievalProvider = provider;
}

export function resetStandardsRetrievalProvider() {
  standardsRetrievalProvider = createSupabaseVectorStandardsProvider();
}
