import { describe, expect, it } from "vitest";

import {
  SMARTEDU_PROJECT_HEADER,
  getOptionalSmartEduProjectId,
  readSmartEduProjectIdFromHeaders,
  withSmartEduProjectHeader,
} from "@/lib/api/smartedu-request-headers";

describe("smartedu request headers", () => {
  it("injects the project header while preserving existing headers", () => {
    expect(
      withSmartEduProjectHeader(
        {
          "content-type": "application/json",
        },
        "  project-123  ",
      ),
    ).toEqual({
      "content-type": "application/json",
      [SMARTEDU_PROJECT_HEADER]: "project-123",
    });
  });

  it("reads the optional project id from request headers", () => {
    const headers = new Headers({
      [SMARTEDU_PROJECT_HEADER]: "  project-456 ",
    });

    expect(readSmartEduProjectIdFromHeaders(headers)).toBe("project-456");
  });

  it("returns undefined for empty project header values", () => {
    expect(getOptionalSmartEduProjectId("   ")).toBeUndefined();
  });
});
