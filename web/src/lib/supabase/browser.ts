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
