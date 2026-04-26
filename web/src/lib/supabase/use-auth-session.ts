"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "./browser";

type AuthSessionStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthSessionState {
  session: Session | null;
  status: AuthSessionStatus;
}

export function useAuthSession(): AuthSessionState {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthSessionStatus>(supabase ? "loading" : "unauthenticated");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
        setStatus(data.session?.user ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setSession(null);
        setStatus("unauthenticated");
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession?.user ? "authenticated" : "unauthenticated");
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  return { session, status };
}
