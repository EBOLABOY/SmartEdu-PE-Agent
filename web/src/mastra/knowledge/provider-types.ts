import type { StandardsMarket } from "@/lib/lesson-authoring-contract";

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
