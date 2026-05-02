import type { StructuredArtifactData } from "@/lib/lesson-authoring-contract";

export type ArtifactStreamStage = "html" | "lesson";

export type LessonBlockId = "basic" | "objectives" | "periodPlan" | "evaluationLoad";

export type ArtifactStreamEvent =
  | {
      artifactId: string;
      stage: ArtifactStreamStage;
      title: string;
      type: "artifact-start";
    }
  | {
      artifactId: string;
      detail?: string;
      progress?: number;
      stage: ArtifactStreamStage;
      step: string;
      title: string;
      type: "artifact-progress";
    }
  | {
      artifactId: string;
      patch: unknown;
      patchKind: "asset" | "html-section" | "lesson-partial" | "metadata";
      stage: ArtifactStreamStage;
      type: "artifact-patch";
    }
  | {
      artifactId: string;
      snapshot: StructuredArtifactData;
      stage: ArtifactStreamStage;
      type: "artifact-snapshot";
    }
  | {
      artifactId: string;
      snapshot: StructuredArtifactData;
      stage: ArtifactStreamStage;
      type: "artifact-finish";
    }
  | {
      artifactId: string;
      message: string;
      recoverable: boolean;
      stage: ArtifactStreamStage;
      type: "artifact-error";
    };

export type LessonBlockGenerationEvent = {
  blockId: LessonBlockId;
  partial: unknown;
  sequence: number;
};

export interface ArtifactSnapshotBuilder<TPatch> {
  applyPatch(patch: TPatch): StructuredArtifactData | undefined;
  complete(): StructuredArtifactData;
  start(): StructuredArtifactData;
}
