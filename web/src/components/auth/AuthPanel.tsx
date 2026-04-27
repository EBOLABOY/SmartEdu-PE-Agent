"use client";

import { KeyRound, LogOut, Mail, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import AuthForm from "@/components/auth/AuthForm";
import EmailSettingsTab from "@/components/auth/EmailSettingsTab";
import ProfileTab from "@/components/auth/ProfileTab";
import SecuritySettingsTab from "@/components/auth/SecuritySettingsTab";
import WorkspaceTab from "@/components/auth/WorkspaceTab";
import {
  type AccountTab,
  type AuthMode,
  getAppOrigin,
} from "@/components/auth/auth-model";
import { useAccountWorkspaces } from "@/components/auth/useAccountWorkspaces";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useProfile } from "@/components/auth/useProfile";
import { Button } from "@/components/ui/button";
import { StateLoading, StateNotice } from "@/components/ui/state-surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface AuthPanelProps {
  initialMode?: AuthMode;
  initialTab?: AccountTab;
  inviteToken?: string | null;
  onAuthChanged?: () => void;
}

export default function AuthPanel({
  initialMode = "sign-in",
  initialTab = "profile",
  inviteToken,
  onAuthChanged,
}: AuthPanelProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);
  const [nextEmail, setNextEmail] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoading, session } = useAuthSession({
    onAuthChanged,
    onPasswordRecovery: () => setActiveTab("security"),
    supabase,
  });
  const { isProfileLoading, profile, saveProfile, setProfile } = useProfile({
    isSubmitting,
    onProfileSaved: onAuthChanged,
    setIsSubmitting,
    supabase,
    userId: session?.user.id,
  });
  const {
    createInvitation,
    inviteEmailDrafts,
    inviteLinks,
    inviteRoleDrafts,
    isWorkspaceLoading,
    loadWorkspaces,
    removeMember,
    resendInvitation,
    revokeInvitation,
    setInviteEmailDrafts,
    setInviteRoleDrafts,
    setWorkspaceNameDrafts,
    updateMemberRole,
    updateWorkspaceName,
    workspaceNameDrafts,
    workspaces,
  } = useAccountWorkspaces({
    inviteToken,
    onAuthChanged,
    onInviteAccepted: () => setActiveTab("workspace"),
    setIsSubmitting,
    userId: session?.user.id,
  });

  const submit = async () => {
    if (!supabase || isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      toast.warning("请填写有效邮箱。");
      return;
    }

    if (mode !== "forgot-password" && password.length < 6) {
      toast.warning("密码至少需要 6 位。");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "forgot-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${getAppOrigin()}/auth/callback?next=${encodeURIComponent("/account?tab=security")}`,
        });

        if (error) {
          throw error;
        }

        toast.success("重置邮件已发送", {
          description: "请通过邮件链接回到应用后设置新密码。",
        });
        return;
      }

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
      const title =
        mode === "sign-in"
          ? "登录失败"
          : mode === "sign-up"
            ? "注册失败"
            : "重置邮件发送失败";
      toast.error(title, {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateEmail = async () => {
    if (!supabase || isSubmitting) {
      return;
    }

    const normalizedEmail = nextEmail.trim();

    if (!normalizedEmail) {
      toast.warning("请填写新的邮箱。");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser(
        { email: normalizedEmail },
        {
          emailRedirectTo: `${getAppOrigin()}/auth/callback?next=${encodeURIComponent("/?account=profile")}`,
        },
      );

      if (error) {
        throw error;
      }

      toast.success("邮箱变更确认已发送", {
        description: "请按 Supabase 邮件中的确认链接完成变更。",
      });
      setNextEmail("");
    } catch (error) {
      toast.error("邮箱更新失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updatePassword = async () => {
    if (!supabase || isSubmitting) {
      return;
    }

    if (nextPassword.length < 6) {
      toast.warning("新密码至少需要 6 位。");
      return;
    }

    if (nextPassword !== confirmPassword) {
      toast.warning("两次输入的新密码不一致。");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });

      if (error) {
        throw error;
      }

      toast.success("密码已更新");
      setNextPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error("密码更新失败", {
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
      <StateNotice
        description="Supabase 浏览器环境变量未配置，当前只能使用临时会话模式。"
        title="持久化未启用"
      />
    );
  }

  if (isLoading) {
    return <StateLoading label="正在读取登录状态..." />;
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
        </div>

        <Tabs onValueChange={(value) => setActiveTab(value as AccountTab)} value={activeTab}>
          <TabsList className="grid h-auto w-full grid-cols-4">
            <TabsTrigger value="profile">
              <UserRound className="mr-1.5 size-4" />
              资料
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="mr-1.5 size-4" />
              邮箱
            </TabsTrigger>
            <TabsTrigger value="security">
              <KeyRound className="mr-1.5 size-4" />
              安全
            </TabsTrigger>
            <TabsTrigger value="workspace">
              <UsersRound className="mr-1.5 size-4" />
              团队
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab
              isProfileLoading={isProfileLoading}
              isSubmitting={isSubmitting}
              onSave={() => void saveProfile()}
              profile={profile}
              setProfile={setProfile}
            />
          </TabsContent>

          <TabsContent value="email">
            <EmailSettingsTab
              isSubmitting={isSubmitting}
              nextEmail={nextEmail}
              onUpdateEmail={() => void updateEmail()}
              setNextEmail={setNextEmail}
            />
          </TabsContent>

          <TabsContent value="security">
            <SecuritySettingsTab
              confirmPassword={confirmPassword}
              isSubmitting={isSubmitting}
              nextPassword={nextPassword}
              onUpdatePassword={() => void updatePassword()}
              setConfirmPassword={setConfirmPassword}
              setNextPassword={setNextPassword}
            />
          </TabsContent>

          <TabsContent value="workspace">
            <WorkspaceTab
              createInvitation={createInvitation}
              currentUserId={session.user.id}
              inviteEmailDrafts={inviteEmailDrafts}
              inviteLinks={inviteLinks}
              inviteRoleDrafts={inviteRoleDrafts}
              isSubmitting={isSubmitting}
              isWorkspaceLoading={isWorkspaceLoading}
              loadWorkspaces={() => loadWorkspaces()}
              removeMember={removeMember}
              resendInvitation={resendInvitation}
              revokeInvitation={revokeInvitation}
              setInviteEmailDrafts={setInviteEmailDrafts}
              setInviteRoleDrafts={setInviteRoleDrafts}
              setWorkspaceNameDrafts={setWorkspaceNameDrafts}
              updateMemberRole={updateMemberRole}
              updateWorkspaceName={updateWorkspaceName}
              workspaceNameDrafts={workspaceNameDrafts}
              workspaces={workspaces}
            />
          </TabsContent>
        </Tabs>

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
    <AuthForm
      email={email}
      isSubmitting={isSubmitting}
      mode={mode}
      onSubmit={() => void submit()}
      password={password}
      setEmail={setEmail}
      setMode={setMode}
      setPassword={setPassword}
    />
  );
}
