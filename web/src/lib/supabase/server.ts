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
