"use client";

import { useSearchParams } from "next/navigation";

import AuthPanel from "@/components/auth/AuthPanel";
import AuthPageShell from "@/components/auth/AuthPageShell";

type AccountTab = "profile" | "email" | "security" | "workspace";

function parseAccountTab(value: string | null): AccountTab {
  if (value === "email" || value === "security" || value === "workspace") {
    return value;
  }

  return "profile";
}

export default function AccountPageClient() {
  const searchParams = useSearchParams();
  const initialTab = parseAccountTab(searchParams.get("tab"));
  const inviteToken = searchParams.get("invite");

  return (
    <AuthPageShell
      description="这里是账号后台，可维护教师资料、邮箱、安全设置、团队和邀请。资料会作为后续教案生成的默认上下文。"
      title="账号后台"
    >
      <AuthPanel initialTab={inviteToken ? "workspace" : initialTab} inviteToken={inviteToken} />
    </AuthPageShell>
  );
}
