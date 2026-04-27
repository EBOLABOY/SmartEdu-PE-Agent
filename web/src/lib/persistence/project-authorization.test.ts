import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

import { normalizeProjectAuthorizationError, requireProjectWriteAccess } from "./project-authorization";

function createRpcSupabaseClient(
  response: { data: string | null; error: { message: string } | null },
) {
  const rpc = vi.fn(async () => response);

  return {
    rpc,
  } as unknown as SupabaseClient<Database>;
}

describe("normalizeProjectAuthorizationError", () => {
  it("maps database authorization errors to HTTP status codes", () => {
    expect(normalizeProjectAuthorizationError("authentication required")).toMatchObject({ status: 401 });
    expect(normalizeProjectAuthorizationError("project not found")).toMatchObject({ status: 404 });
    expect(normalizeProjectAuthorizationError("project write access denied")).toMatchObject({ status: 403 });
  });

  it("maps a missing require_project_writer RPC to an operational migration error", () => {
    expect(
      normalizeProjectAuthorizationError(
        "Could not find the function public.require_project_writer(target_project_id) in the schema cache",
      ),
    ).toMatchObject({ status: 503 });
  });
});

describe("requireProjectWriteAccess", () => {
  it("uses the require_project_writer RPC as the single write authorization boundary", async () => {
    const supabase = createRpcSupabaseClient({
      data: "organization-1",
      error: null,
    });

    await expect(requireProjectWriteAccess(supabase, "project-1")).resolves.toBe("organization-1");
  });

  it("does not bypass the RPC when the function is missing", async () => {
    const supabase = createRpcSupabaseClient({
      data: null,
      error: {
        message: "Could not find the function public.require_project_writer(target_project_id) in the schema cache",
      },
    });

    await expect(requireProjectWriteAccess(supabase, "project-1")).rejects.toMatchObject({
      status: 503,
    });
  });
});
