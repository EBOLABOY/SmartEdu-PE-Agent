import type { StandardsMarket } from "@/lib/lesson-authoring-contract";

import type { PeStandardEntry } from "./standards_2022";

export type StandardReference = {
  id: string;
  title: string;
  summary: string;
  source: PeStandardEntry["source"];
  officialVersion: PeStandardEntry["officialVersion"];
  gradeBands: PeStandardEntry["gradeBands"];
  module: PeStandardEntry["module"];
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
  officialStatus: string;
  sourceName: string;
  issuer: string;
  version: string;
  url: string;
  availability: "ready" | "planned";
};

export type StandardsSearchResult = {
  requestedMarket: StandardsMarket;
  resolvedMarket: StandardsMarket;
  references: StandardReference[];
  context: string;
  corpus: StandardsCorpusMetadata;
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
