/**
 * @file Supabase 类型化客户端类型别名
 *
 * 提供 `SmartEduSupabaseClient` 类型别名，统一项目中所有 Supabase 客户端的类型签名。
 * 使用此类型而非直接写 `SupabaseClient<Database>`，以便：
 *   1. 减少样板代码，一处定义全局复用
 *   2. 若 Database Schema 变更，只需重新生成 database.types.ts
 *
 * 依赖：database.types.ts（Database 类型）
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type SmartEduSupabaseClient = SupabaseClient<Database>;
