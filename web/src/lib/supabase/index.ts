/**
 * @module supabase
 * Supabase 客户端层 - 封装服务端/浏览器端客户端工厂与类型定义。
 */

// ---- browser ----
export { hasSupabaseBrowserEnv, createSupabaseBrowserClient } from "./browser";

// ---- database.types (auto-generated) ----
export type { Json, Database, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from "./database.types";
export { Constants } from "./database.types";

// ---- env ----
export type { SupabasePublicConfig, SupabaseAdminConfig } from "./env";
export { getSupabasePublicConfig, getSupabaseAdminConfig } from "./env";

// ---- server ----
export {
  hasSupabasePublicEnv,
  hasSupabaseServiceRoleEnv,
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./server";

// ---- typed-client ----
export type { SmartEduSupabaseClient } from "./typed-client";

// ---- use-auth-session ----
export { useAuthSession } from "./use-auth-session";