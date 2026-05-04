/**
 * @file Supabase 环境配置读取
 *
 * 从 process.env 读取 Supabase 连接配置：
 *   - getSupabasePublicConfig()  — NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   - getSupabaseAdminConfig()   — 上述 + SUPABASE_SECRET_KEY（service_role）
 *
 * 所有配置缺失时返回 null，由调用方决定降级策略。
 */
export type SupabasePublicConfig = {
  publishableKey: string;
  url: string;
};

export type SupabaseAdminConfig = SupabasePublicConfig & {
  secretKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { publishableKey, url };
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig | null {
  const publicConfig = getSupabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!publicConfig || !secretKey) {
    return null;
  }

  return { ...publicConfig, secretKey };
}
