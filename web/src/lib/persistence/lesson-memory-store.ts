import {
  buildLessonAuthoringMemoryPatch,
  mergeLessonAuthoringMemory,
} from "@/lib/lesson-authoring-memory";
import {
  lessonAuthoringMemorySchema,
  type LessonAuthoringMemory,
  type LessonIntakeResult,
  type PeTeacherContext,
} from "@/lib/lesson-authoring-contract";
import type { Json } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

const LESSON_MEMORY_METADATA_KEY = "lessonAuthoringMemory";

export type LessonMemoryPersistence = {
  loadMemory: (input: { projectId: string }) => Promise<LessonAuthoringMemory | undefined>;
  rememberFromIntake: (input: {
    context?: PeTeacherContext;
    intake: LessonIntakeResult;
    projectId: string;
    requestId: string;
  }) => Promise<LessonAuthoringMemory | undefined>;
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMetadata(value: Json) {
  return isJsonObject(value) ? { ...value } : {};
}

function readMemoryFromMetadata(metadata: Json) {
  const parsed = lessonAuthoringMemorySchema.safeParse(parseMetadata(metadata)[LESSON_MEMORY_METADATA_KEY]);

  return parsed.success ? parsed.data : undefined;
}

async function loadProjectMetadata(supabase: SmartEduSupabaseClient, projectId: string) {
  const { data, error } = await supabase.from("projects").select("metadata").eq("id", projectId).single();

  if (error) {
    throw error;
  }

  return data.metadata;
}

export function createLessonMemoryPersistence(
  supabase: SmartEduSupabaseClient | null,
): LessonMemoryPersistence | null {
  if (!supabase) {
    return null;
  }

  return {
    async loadMemory({ projectId }) {
      try {
        const metadata = await loadProjectMetadata(supabase, projectId);

        return readMemoryFromMetadata(metadata);
      } catch (error) {
        console.warn("[lesson-memory] load-failed", {
          projectId,
          message: error instanceof Error ? error.message : "unknown-error",
        });
        return undefined;
      }
    },

    async rememberFromIntake({ context, intake, projectId, requestId }) {
      try {
        const metadata = await loadProjectMetadata(supabase, projectId);
        const currentMemory = readMemoryFromMetadata(metadata);
        const patch = buildLessonAuthoringMemoryPatch({ context, intake });
        const nextMemory = mergeLessonAuthoringMemory(currentMemory, patch);

        if (!nextMemory) {
          return undefined;
        }

        const nextMetadata = {
          ...parseMetadata(metadata),
          [LESSON_MEMORY_METADATA_KEY]: toJson(nextMemory),
        };
        const { error } = await supabase.from("projects").update({ metadata: toJson(nextMetadata) }).eq("id", projectId);

        if (error) {
          throw error;
        }

        return nextMemory;
      } catch (error) {
        console.warn("[lesson-memory] save-failed", {
          projectId,
          requestId,
          message: error instanceof Error ? error.message : "unknown-error",
        });
        return undefined;
      }
    },
  };
}
