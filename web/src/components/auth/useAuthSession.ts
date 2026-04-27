"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

interface UseAuthSessionInput {
  onAuthChanged?: () => void;
  onPasswordRecovery?: () => void;
  supabase: SmartEduSupabaseClient | null;
}

export function useAuthSession({
  onAuthChanged,
  onPasswordRecovery,
  supabase,
}: UseAuthSessionInput) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        onPasswordRecovery?.();
        toast.info("请设置新密码", {
          description: "密码重置会话已建立，请在安全设置中输入新密码。",
        });
      }
      onAuthChanged?.();
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [onAuthChanged, onPasswordRecovery, supabase]);

  return { isLoading, session };
}
