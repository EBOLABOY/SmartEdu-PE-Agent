import type { StandardsMarket } from "@/lib/lesson/authoring-contract";

export type StandardReference = {
  id: string;
  title: string;
  summary: string;
  source: string;
  officialVersion: string;
  gradeBands: string[];
  module: string;
  sectionPath: string[];
  keywords: string[];
  requirements: string[];
  teachingImplications: string[];
  citation: string;
  score: number;
};

export type StandardsCorpusMetadata = {
  corpusId: string;
  displayName: string;
  issuer: string;
  version: string;
  url: string | null;
  availability: "ready" | "planned";
};

export type StandardsSearchResult = {
  requestedMarket: StandardsMarket;
  resolvedMarket: StandardsMarket;
  references: StandardReference[];
  context: string;
  corpus: StandardsCorpusMetadata | null;
  warning?: string;
};

export type StandardsRetrievalOptions = {
  limit?: number;
  market?: StandardsMarket;
};

export interface StandardsRetrievalProvider {
  readonly id: string;
  search(query: string, options: Required<StandardsRetrievalOptions>): Promise<StandardsSearchResult>;
}

export type TextbookReference = {
  id: string;
  title: string;
  summary: string;
  bodyExcerpt: string;
  citation: string;
  publisher: string;
  textbookName: string;
  edition: string | null;
  grade: string | null;
  level: string | null;
  module: string;
  sectionPath: string[];
  keywords: string[];
  sourceKind: string;
  sportItem: string | null;
  teachingAnalysis: string[];
  technicalPoints: string[];
  teachingSuggestions: string[];
  safetyNotes: string[];
  score: number;
};

export type TextbookSearchResult = {
  market: StandardsMarket;
  stage: string;
  publisher?: string;
  grade?: string;
  references: TextbookReference[];
  context: string;
  warning?: string;
};

export type TextbookRetrievalOptions = {
  grade?: string;
  limit?: number;
  market?: StandardsMarket;
  publisher?: string;
  stage?: string;
};

export interface TextbookRetrievalProvider {
  readonly id: string;
  search(query: string, options: Required<TextbookRetrievalOptions>): Promise<TextbookSearchResult>;
}
