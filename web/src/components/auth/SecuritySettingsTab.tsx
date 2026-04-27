"use client";

import { type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SecuritySettingsTabProps {
  confirmPassword: string;
  isSubmitting: boolean;
  nextPassword: string;
  onUpdatePassword: () => void;
  setConfirmPassword: Dispatch<SetStateAction<string>>;
  setNextPassword: Dispatch<SetStateAction<string>>;
}

export default function SecuritySettingsTab({
  confirmPassword,
  isSubmitting,
  nextPassword,
  onUpdatePassword,
  setConfirmPassword,
  setNextPassword,
}: SecuritySettingsTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-muted-foreground">
        修改密码使用 Supabase Auth 的安全更新接口；通过重置邮件进入时，也在这里设置新密码。
      </p>
      <Input
        autoComplete="new-password"
        disabled={isSubmitting}
        onChange={(event) => setNextPassword(event.target.value)}
        placeholder="新密码，至少 6 位"
        type="password"
        value={nextPassword}
      />
      <Input
        autoComplete="new-password"
        disabled={isSubmitting}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder="再次输入新密码"
        type="password"
        value={confirmPassword}
      />
      <Button
        className="w-full"
        disabled={isSubmitting}
        onClick={onUpdatePassword}
        type="button"
        variant="brand"
      >
        更新密码
      </Button>
    </div>
  );
}
