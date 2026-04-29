import SmartEduWorkspace from "@/components/workspace/SmartEduWorkspace";
import {
  getWorkspaceSearchParam,
  loadWorkspacePageData,
  type WorkspaceSearchParams,
} from "@/lib/workspace/page-data";

type AppPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function App({ searchParams }: AppPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const pageData = await loadWorkspacePageData(resolvedSearchParams);
  const accountMode = getWorkspaceSearchParam(resolvedSearchParams, "account");
  const inviteToken = getWorkspaceSearchParam(resolvedSearchParams, "invite");

  return (
    <SmartEduWorkspace
      accountMode={accountMode}
      currentProject={pageData.currentProject}
      initialMessages={pageData.messages}
      inviteToken={inviteToken}
      persistedVersions={pageData.persistedVersions}
      projectId={pageData.projectId}
      projects={pageData.projects}
    />
  );
}
