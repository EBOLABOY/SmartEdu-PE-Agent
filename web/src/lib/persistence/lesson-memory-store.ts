/**
 * @module lesson-memory-store
 * 教案创作记忆的持久化。加载和保存用户上下文与意图采集结果，
 * 支持增量记忆合并，创建记忆持久化服务实例。
 */
import {
  buildLessonAuthoringMemoryPatch,
  mergeLessonAuthoringMemory,
} from "@/lib/lesson/authoring-memory";
import {
  lessonAuthoringMemorySchema,
  type LessonAuthoringMemory,
  type LessonIntakeResult,
  type PeTeacherContext,
} from "@/lib/lesson/authoring-contract";
import type { Json } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";
import { deepClone, isPlainObject } from "@/lib/utils/type-guards";

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
  return deepClone(value) as Json;
}


function parseMetadata(value: Json) {
  return isPlainObject(value) ? { ...value } : {};
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
