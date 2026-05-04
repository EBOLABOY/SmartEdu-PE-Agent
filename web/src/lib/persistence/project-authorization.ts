/**
 * @module project-authorization
 * 项目写权限校验。通过 Supabase RPC 检查用户对项目的写权限，
 * 提供权限错误归一化和缺失数据库函数的友好提示。
 */
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export class ProjectAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ProjectAuthorizationError";
  }
}

function isMissingRequireProjectWriterRpcError(message: string) {
  return (
    message.includes("Could not find the function public.require_project_writer") ||
    message.includes("function public.require_project_writer") ||
    message.includes("PGRST202")
  );
}

export function normalizeProjectAuthorizationError(message: string) {
  if (isMissingRequireProjectWriterRpcError(message)) {
    return new ProjectAuthorizationError(
      "数据库写权限函数 require_project_writer 尚未应用。请执行最新 Supabase migration 并刷新 schema cache。",
      503,
    );
  }

  switch (message) {
    case "authentication required":
      return new ProjectAuthorizationError("当前会话未登录，无法写入项目。", 401);
    case "project not found":
      return new ProjectAuthorizationError("目标项目不存在。", 404);
    case "project write access denied":
    case "project access denied":
      return new ProjectAuthorizationError("当前账号无权写入该项目。", 403);
    default:
      return new ProjectAuthorizationError(message || "项目写入权限校验失败。", 500);
  }
}

export async function requireProjectWriteAccess(
  supabase: SmartEduSupabaseClient,
  projectId: string,
) {
  const { data, error } = await supabase.rpc("require_project_writer", {
    target_project_id: projectId,
  });

  if (error) {
    throw normalizeProjectAuthorizationError(error.message);
  }

  if (!data) {
    throw normalizeProjectAuthorizationError("project not found");
  }

  return data;
}
