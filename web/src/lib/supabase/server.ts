/**
 * @file Supabase 服务端客户端工厂
 *
 * 提供 Next.js 服务端（Server Components / Route Handlers）使用的 Supabase 客户端：
 *   - createSupabaseAdminClient()  — service_role 权限，跳过 RLS，仅用于管理操作
 *   - createSupabaseServerClient() — 公开权限 + cookie 会话，用于常规服务端请求
 *   - hasSupabasePublicEnv() / hasSupabaseServiceRoleEnv() — 环境变量可用性检查
 *
 * 依赖：database.types.ts（Database 类型）、env.ts（配置读取）
 */
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { getSupabaseAdminConfig, getSupabasePublicConfig } from "./env";

export function hasSupabasePublicEnv() {
  return Boolean(getSupabasePublicConfig());
}

export function hasSupabaseServiceRoleEnv() {
  return Boolean(getSupabaseAdminConfig());
}

export function createSupabaseAdminClient() {
  const config = getSupabaseAdminConfig();

  if (!config) {
    return null;
  }

  return createClient<Database>(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();

  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    config.url,
    config.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies; Route Handlers can.
          }
        },
      },
    },
  );
}
