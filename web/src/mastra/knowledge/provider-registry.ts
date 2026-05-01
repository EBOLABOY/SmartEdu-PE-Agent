import type { StandardsRetrievalProvider, TextbookRetrievalProvider } from "./provider-types";
import { createSupabaseVectorStandardsProvider } from "./supabase_vector_standards_provider";
import { createSupabaseVectorTextbookProvider } from "./supabase_vector_textbook_provider";

let standardsRetrievalProvider: StandardsRetrievalProvider = createSupabaseVectorStandardsProvider();
let textbookRetrievalProvider: TextbookRetrievalProvider = createSupabaseVectorTextbookProvider();

export function getStandardsRetrievalProvider() {
  return standardsRetrievalProvider;
}

export function setStandardsRetrievalProvider(provider: StandardsRetrievalProvider) {
  standardsRetrievalProvider = provider;
}

export function resetStandardsRetrievalProvider() {
  standardsRetrievalProvider = createSupabaseVectorStandardsProvider();
}

export function getTextbookRetrievalProvider() {
  return textbookRetrievalProvider;
}

export function setTextbookRetrievalProvider(provider: TextbookRetrievalProvider) {
  textbookRetrievalProvider = provider;
}

export function resetTextbookRetrievalProvider() {
  textbookRetrievalProvider = createSupabaseVectorTextbookProvider();
}
