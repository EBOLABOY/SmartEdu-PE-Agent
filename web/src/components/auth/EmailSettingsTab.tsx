"use client";

import { type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EmailSettingsTabProps {
  isSubmitting: boolean;
  nextEmail: string;
  onUpdateEmail: () => void;
  setNextEmail: Dispatch<SetStateAction<string>>;
}

export default function EmailSettingsTab({
  isSubmitting,
  nextEmail,
  onUpdateEmail,
  setNextEmail,
}: EmailSettingsTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-muted-foreground">
        邮箱变更交给 Supabase Auth 处理。根据项目配置，可能需要新旧邮箱共同确认。
      </p>
      <Input
        autoComplete="email"
        disabled={isSubmitting}
        onChange={(event) => setNextEmail(event.target.value)}
        placeholder="新的邮箱地址"
        type="email"
        value={nextEmail}
      />
      <Button
        className="w-full"
        disabled={isSubmitting}
        onClick={onUpdateEmail}
        type="button"
        variant="brand"
      >
        发送邮箱变更确认
      </Button>
    </div>
  );
}
