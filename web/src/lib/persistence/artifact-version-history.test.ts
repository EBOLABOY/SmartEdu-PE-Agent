import { describe, expect, it } from "vitest";

import { toPersistedArtifactVersion } from "@/lib/persistence/artifact-version-history";
import type { Database } from "@/lib/supabase/database.types";

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

const BASE_ROW: ArtifactVersionRow = {
  artifact_id: "11111111-1111-1111-1111-111111111111",
  content: "# 教案方案",
  content_type: "markdown",
  created_at: "2026-04-25T12:00:00.000Z",
  created_by: "22222222-2222-2222-2222-222222222222",
  id: "33333333-3333-3333-3333-333333333333",
  project_id: "44444444-4444-4444-4444-444444444444",
  protocol_version: "structured-v1",
  source_message_id: null,
  stage: "lesson",
  status: "ready",
  version_number: 2,
  warning_text: null,
  workflow_trace: {
    protocolVersion: "structured-v1",
    requestId: "trace-request-id",
    mode: "lesson",
    phase: "completed",
    responseTransport: "structured-data-part",
    requestedMarket: "cn-compulsory-2022",
    resolvedMarket: "cn-compulsory-2022",
    warnings: [],
    trace: [],
    updatedAt: "2026-04-25T12:00:00.000Z",
  },
};

describe("artifact-version-history", () => {
  it("会把 artifact_versions 行映射为前端可消费 DTO", () => {
    const version = toPersistedArtifactVersion(BASE_ROW);

    expect(version.id).toBe(BASE_ROW.id);
    expect(version.artifactId).toBe(BASE_ROW.artifact_id);
    expect(version.versionNumber).toBe(2);
    expect(version.trace?.phase).toBe("completed");
  });

  it("遇到非法 workflow_trace 时会安静忽略 trace", () => {
    const version = toPersistedArtifactVersion({
      ...BASE_ROW,
      workflow_trace: { invalid: true },
    });

    expect(version.trace).toBeUndefined();
  });
});
