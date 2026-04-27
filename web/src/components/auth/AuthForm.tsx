"use client";

import { type Dispatch, type SetStateAction } from "react";

import { type AuthMode } from "@/components/auth/auth-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthFormProps {
  email: string;
  isSubmitting: boolean;
  mode: AuthMode;
  onSubmit: () => void;
  password: string;
  setEmail: Dispatch<SetStateAction<string>>;
  setMode: Dispatch<SetStateAction<AuthMode>>;
  setPassword: Dispatch<SetStateAction<string>>;
}

export default function AuthForm({
  email,
  isSubmitting,
  mode,
  onSubmit,
  password,
  setEmail,
  setMode,
  setPassword,
}: AuthFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {mode === "sign-in"
            ? "登录账号"
            : mode === "sign-up"
              ? "创建账号"
              : "重置密码"}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {mode === "forgot-password"
            ? "输入注册邮箱，Supabase 会发送安全重置链接。"
            : "登录后会启用项目持久化、历史恢复与版本追踪；未登录仍可使用临时生成模式。"}
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
        {mode !== "forgot-password" ? (
          <Input
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            disabled={isSubmitting}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSubmit();
              }
            }}
            placeholder="密码，至少 6 位"
            type="password"
            value={password}
          />
        ) : null}
      </div>

      <Button
        className="w-full"
        disabled={isSubmitting}
        onClick={onSubmit}
        type="button"
        variant="brand"
      >
        {mode === "sign-in"
          ? "登录并启用持久化"
          : mode === "sign-up"
            ? "注册并启用持久化"
            : "发送重置邮件"}
      </Button>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <button
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          disabled={isSubmitting}
          onClick={() => setMode((currentMode) => (currentMode === "sign-up" ? "sign-in" : "sign-up"))}
          type="button"
        >
          {mode === "sign-up" ? "已有账号？返回登录" : "还没有账号？创建一个"}
        </button>
        <button
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          disabled={isSubmitting}
          onClick={() => setMode((currentMode) => (currentMode === "forgot-password" ? "sign-in" : "forgot-password"))}
          type="button"
        >
          {mode === "forgot-password" ? "返回登录" : "忘记密码？"}
        </button>
      </div>
    </div>
  );
}
