"use client";

import type { Session } from "@supabase/supabase-js";
import { LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "sign-in" | "sign-up";

interface AuthPanelProps {
  onAuthChanged?: () => void;
}

export default function AuthPanel({ onAuthChanged }: AuthPanelProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      onAuthChanged?.();
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [onAuthChanged, supabase]);

  const submit = async () => {
    if (!supabase || isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim();

    if (!normalizedEmail || password.length < 6) {
      toast.warning("请填写有效邮箱和至少 6 位密码。");
      return;
    }

    setIsSubmitting(true);

    try {
      const result =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password,
            })
          : await supabase.auth.signUp({
              email: normalizedEmail,
              password,
            });

      if (result.error) {
        throw result.error;
      }

      toast.success(mode === "sign-in" ? "已登录" : "账号已创建", {
        description:
          mode === "sign-up" && !result.data.session
            ? "如果项目开启了邮箱确认，请先到邮箱完成验证。"
            : "项目目录和后续生成会自动进入持久化模式。",
      });
      setPassword("");
      onAuthChanged?.();
    } catch (error) {
      toast.error(mode === "sign-in" ? "登录失败" : "注册失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = async () => {
    if (!supabase || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      toast.success("已退出登录");
      onAuthChanged?.();
    } catch (error) {
      toast.error("退出失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!supabase) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Supabase 浏览器环境变量未配置，当前只能使用临时会话模式。
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        正在读取登录状态...
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-brand/20 bg-brand/8 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="size-4 text-brand" />
            已启用持久化工作区
          </div>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            当前账号：{session.user.email ?? session.user.id}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            后续项目、会话消息、教案版本和互动大屏版本会写入 Supabase，并可从项目目录恢复。
          </p>
        </div>
        <Button
          className="w-full"
          disabled={isSubmitting}
          onClick={() => void signOut()}
          type="button"
          variant="outline"
        >
          <LogOut className="size-4" />
          退出登录
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {mode === "sign-in" ? "登录账号" : "创建账号"}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          登录后会启用项目持久化、历史恢复与版本追踪；未登录仍可使用临时生成模式。
        </p>
      </div>

      <div className="space-y-3">
        <Input
          autoComplete="email"
          disabled={isSubmitting}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="邮箱"
          type="email"
          value={email}
        />
        <Input
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          disabled={isSubmitting}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submit();
            }
          }}
          placeholder="密码，至少 6 位"
          type="password"
          value={password}
        />
      </div>

      <Button
        className="w-full"
        disabled={isSubmitting}
        onClick={() => void submit()}
        type="button"
        variant="brand"
      >
        {mode === "sign-in" ? "登录并启用持久化" : "注册并启用持久化"}
      </Button>

      <button
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        disabled={isSubmitting}
        onClick={() => setMode((currentMode) => (currentMode === "sign-in" ? "sign-up" : "sign-in"))}
        type="button"
      >
        {mode === "sign-in" ? "还没有账号？创建一个" : "已有账号？返回登录"}
      </button>
    </div>
  );
}
