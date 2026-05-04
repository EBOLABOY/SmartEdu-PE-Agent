import type { StructuredArtifactData } from "@/lib/lesson/authoring-contract";

export type ArtifactStreamStage = "html" | "lesson";

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
      patchKind: "asset" | "html-document" | "lesson-partial" | "metadata";
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
