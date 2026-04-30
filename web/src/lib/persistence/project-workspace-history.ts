import { safeValidateUIMessages } from "ai";

import { extractJsonObjectText } from "@/lib/artifact-protocol";
import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  persistedConversationSchema,
  persistedProjectMessageSchema,
  persistedProjectSummarySchema,
  smartEduDataSchemas,
  type ArtifactContentType,
  type PersistedConversation,
  type PersistedProjectMessage,
  type PersistedProjectSummary,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { toIsoDateTime } from "@/lib/date-time";
import {
  readProjectDirectoryManifest,
  writeProjectDirectoryManifest,
} from "@/lib/persistence/project-directory-manifest";
import type { Database } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];

const MAX_PROJECT_DISPLAY_TITLE_LENGTH = 160;
const GENERIC_ARTIFACT_TITLES = new Set([
  "XXX",
  "课时计划 Artifact",
  "互动大屏 Artifact",
]);

function normalizeDisplayTitle(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  if (!normalized || GENERIC_ARTIFACT_TITLES.has(normalized)) {
    return undefined;
  }

  if (normalized.length <= MAX_PROJECT_DISPLAY_TITLE_LENGTH) {
    return normalized;
  }

  return `${normalized
    .slice(0, MAX_PROJECT_DISPLAY_TITLE_LENGTH - 1)
    .trimEnd()}…`;
}

function parseLessonPlan(content: string): CompetitionLessonPlan | undefined {
  try {
    return competitionLessonPlanSchema.parse(
      JSON.parse(extractJsonObjectText(content)),
    );
  } catch {
    return undefined;
  }
}

export function deriveProjectDisplayTitle(input: {
  artifactTitle?: string | null;
  lessonContent?: string | null;
  lessonContentType?: ArtifactContentType | null;
  projectTitle: string;
}) {
  return (
    deriveLessonTitleOverride(input) ??
    normalizeDisplayTitle(input.projectTitle) ??
    input.projectTitle
  );
}

function deriveLessonTitleOverride(input: {
  artifactTitle?: string | null;
  lessonContent?: string | null;
  lessonContentType?: ArtifactContentType | null;
}) {
  const lessonTitle =
    input.lessonContentType === "lesson-json" && input.lessonContent
      ? parseLessonPlan(input.lessonContent)?.title
      : undefined;

  return normalizeDisplayTitle(lessonTitle) ??
    normalizeDisplayTitle(input.artifactTitle);
}

function toPersistedProjectSummary(
  row: ProjectRow,
  titleOverride?: string,
): PersistedProjectSummary {
  return persistedProjectSummarySchema.parse({
    id: row.id,
    title: deriveProjectDisplayTitle({
      projectTitle: row.title,
      artifactTitle: titleOverride,
    }),
    market: row.market,
    createdAt: toIsoDateTime(row.created_at, "projects.created_at"),
    updatedAt: toIsoDateTime(row.updated_at, "projects.updated_at"),
    ...(row.description ? { description: row.description } : {}),
  });
}

function toPersistedConversation(row: ConversationRow): PersistedConversation {
  return persistedConversationSchema.parse({
    id: row.id,
    createdAt: toIsoDateTime(row.created_at, "conversations.created_at"),
    updatedAt: toIsoDateTime(row.updated_at, "conversations.updated_at"),
    ...(row.title ? { title: row.title } : {}),
  });
}

async function toPersistedProjectMessage(
  row: MessageRow,
): Promise<PersistedProjectMessage | null> {
  const parsedMessage = await safeValidateUIMessages<SmartEduUIMessage>({
    messages: [row.ui_message],
    dataSchemas: smartEduDataSchemas,
  });

  if (!parsedMessage.success) {
    return null;
  }

  return persistedProjectMessageSchema.parse({
    id: row.id,
    uiMessageId: row.ui_message_id,
    role: row.role,
    content: row.content,
    createdAt: toIsoDateTime(row.created_at, "messages.created_at"),
    uiMessage: parsedMessage.data[0],
  });
}

async function getLessonTitleOverridesByProjectId(
  supabase: SmartEduSupabaseClient,
  projectIds: string[],
) {
  const titleOverrides = new Map<string, string>();

  if (!projectIds.length) {
    return titleOverrides;
  }

  const { data: artifactRows, error: artifactRowsError } = await supabase
    .from("artifacts")
    .select("*")
    .in("project_id", projectIds)
    .eq("stage", "lesson");

  if (artifactRowsError) {
    throw artifactRowsError;
  }

  const lessonArtifacts = (artifactRows ?? []) as ArtifactRow[];

  lessonArtifacts.forEach((artifact) => {
    const title = deriveLessonTitleOverride({
      artifactTitle: artifact.title,
    });

    if (title) {
      titleOverrides.set(artifact.project_id, title);
    }
  });

  return titleOverrides;
}

export async function listProjectsForUserFromDatabase(
  supabase: SmartEduSupabaseClient,
) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const projectRows = (data ?? []) as ProjectRow[];
  const titleOverrides = await getLessonTitleOverridesByProjectId(
    supabase,
    projectRows.map((row) => row.id),
  );

  return projectRows.map((row) =>
    toPersistedProjectSummary(row, titleOverrides.get(row.id)),
  );
}

export async function refreshProjectDirectoryManifest(
  supabase: SmartEduSupabaseClient,
  userId: string,
  projects?: PersistedProjectSummary[],
) {
  const resolvedProjects = projects ?? (await listProjectsForUserFromDatabase(supabase));

  try {
    await writeProjectDirectoryManifest({
      projects: resolvedProjects,
      userId,
    });
  } catch (error) {
    console.warn("[project-directory-manifest] write-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
      userId,
    });
  }

  return resolvedProjects;
}

export async function listProjectsForUser(
  supabase: SmartEduSupabaseClient,
  options: { userId?: string } = {},
) {
  if (options.userId) {
    try {
      const manifest = await readProjectDirectoryManifest(options.userId);

      if (manifest) {
        return manifest.projects;
      }
    } catch (error) {
      console.warn("[project-directory-manifest] read-failed", {
        message: error instanceof Error ? error.message : "unknown-error",
        userId: options.userId,
      });
    }
  }

  const projects = await listProjectsForUserFromDatabase(supabase);

  if (options.userId) {
    await refreshProjectDirectoryManifest(supabase, options.userId, projects);
  }

  return projects;
}

export async function getProjectWorkspaceHistory(
  supabase: SmartEduSupabaseClient,
  projectId: string,
) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError) {
    throw projectError;
  }

  const projectRow = project as ProjectRow;
  const titleOverrides = await getLessonTitleOverridesByProjectId(supabase, [
    projectRow.id,
  ]);
  const persistedProject = toPersistedProjectSummary(
    projectRow,
    titleOverrides.get(projectRow.id),
  );
  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (conversationsError) {
    throw conversationsError;
  }

  const latestConversation =
    (conversations as ConversationRow[] | null | undefined)?.[0];

  if (!latestConversation) {
    return {
      project: persistedProject,
      conversation: null,
      messages: [] as PersistedProjectMessage[],
    };
  }

  const { data: messageRows, error: messageRowsError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", latestConversation.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (messageRowsError) {
    throw messageRowsError;
  }

  const messages = (
    await Promise.all(
      ((messageRows ?? []) as MessageRow[]).map((row) =>
        toPersistedProjectMessage(row),
      ),
    )
  ).filter(
    (message): message is PersistedProjectMessage => message !== null,
  );

  return {
    project: persistedProject,
    conversation: toPersistedConversation(latestConversation),
    messages,
  };
}

export {
  toPersistedConversation,
  toPersistedProjectMessage,
  toPersistedProjectSummary,
};
