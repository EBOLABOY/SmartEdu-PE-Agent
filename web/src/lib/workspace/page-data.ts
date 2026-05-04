import { validateUIMessages } from "ai";

import {
  projectIdSchema,
  smartEduDataSchemas,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type PersistenceState,
  type SmartEduUIMessage,
} from "@/lib/lesson/authoring-contract";
import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";
import {
  getProjectWorkspaceHistory,
  listProjectsForUser,
} from "@/lib/persistence/project-workspace-history";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export type WorkspacePageData = {
  currentProject: PersistedProjectSummary | null;
  messages: SmartEduUIMessage[];
  persistedVersions: PersistedArtifactVersion[];
  projectDirectoryPersistence: PersistenceState;
  projectId: string | null;
  projects: PersistedProjectSummary[];
};

export type WorkspaceSearchParams = Record<string, string | string[] | undefined>;

const PERSISTENCE_DISABLED_STATE: PersistenceState = {
  enabled: false,
  authenticated: false,
  reason: "missing-supabase-env",
};

const PERSISTENCE_UNAVAILABLE_STATE: PersistenceState = {
  enabled: false,
  authenticated: false,
  reason: "supabase-client-unavailable",
};

const PERSISTENCE_UNAUTHENTICATED_STATE: PersistenceState = {
  enabled: true,
  authenticated: false,
  reason: "missing-auth-session",
};

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function getWorkspaceSearchParam(
  searchParams: WorkspaceSearchParams,
  key: string,
) {
  return getSingleSearchParam(searchParams[key]) ?? null;
}

export async function loadWorkspacePageData(
  searchParams: WorkspaceSearchParams,
): Promise<WorkspacePageData> {
  const rawProjectId = getWorkspaceSearchParam(searchParams, "projectId");
  const parsedProjectId = rawProjectId
    ? projectIdSchema.safeParse(rawProjectId)
    : null;

  if (!hasSupabasePublicEnv()) {
    return {
      currentProject: null,
      messages: [],
      persistedVersions: [],
      projectDirectoryPersistence: PERSISTENCE_DISABLED_STATE,
      projectId: null,
      projects: [],
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      currentProject: null,
      messages: [],
      persistedVersions: [],
      projectDirectoryPersistence: PERSISTENCE_UNAVAILABLE_STATE,
      projectId: null,
      projects: [],
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      currentProject: null,
      messages: [],
      persistedVersions: [],
      projectDirectoryPersistence: PERSISTENCE_UNAUTHENTICATED_STATE,
      projectId: null,
      projects: [],
    };
  }

  const projects = await listProjectsForUser(supabase, { userId: user.id });
  const authenticatedPersistence: PersistenceState = {
    enabled: true,
    authenticated: true,
  };

  if (!parsedProjectId?.success) {
    return {
      currentProject: null,
      messages: [],
      persistedVersions: [],
      projectDirectoryPersistence: authenticatedPersistence,
      projectId: null,
      projects,
    };
  }

  try {
    const [workspace, persistedVersions] = await Promise.all([
      getProjectWorkspaceHistory(supabase, parsedProjectId.data),
      listArtifactVersionsByProject(supabase, parsedProjectId.data),
    ]);
    const messages = workspace.messages.length
      ? await validateUIMessages<SmartEduUIMessage>({
          messages: workspace.messages.map((message) => message.uiMessage),
          dataSchemas: smartEduDataSchemas,
        })
      : [];

    return {
      currentProject: workspace.project,
      messages,
      persistedVersions,
      projectDirectoryPersistence: authenticatedPersistence,
      projectId: parsedProjectId.data,
      projects,
    };
  } catch (error) {
    console.warn("[workspace-page-data] project-bootstrap-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
      projectId: parsedProjectId.data,
    });

    return {
      currentProject: null,
      messages: [],
      persistedVersions: [],
      projectDirectoryPersistence: authenticatedPersistence,
      projectId: null,
      projects,
    };
  }
}
