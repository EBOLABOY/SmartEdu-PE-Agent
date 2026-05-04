/**
 * @file Supabase 浏览器端客户端工厂
 *
 * 提供 Next.js 客户端组件使用的 Supabase 客户端：
 *   - createSupabaseBrowserClient() — 公开权限 + 自动 cookie 管理
 *   - hasSupabaseBrowserEnv()       — 环境变量可用性检查
 *
 * 标记为 "use client"，仅在客户端组件中使用。
 * 依赖：database.types.ts（Database 类型）、env.ts（配置读取）
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { getSupabasePublicConfig } from "./env";

export function hasSupabaseBrowserEnv() {
  return Boolean(getSupabasePublicConfig());
}

export function createSupabaseBrowserClient() {
  const config = getSupabasePublicConfig();

  if (!config) {
    return null;
  }

  return createBrowserClient<Database>(config.url, config.publishableKey);
}
