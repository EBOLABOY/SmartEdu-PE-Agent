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
