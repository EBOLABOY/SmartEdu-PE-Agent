"use client";

import type { Session } from "@supabase/supabase-js";
import { KeyRound, LogOut, Mail, ShieldCheck, Trash2, UserRound, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  accountWorkspacesResponseSchema,
  workspaceInvitationActionResponseSchema,
  type AccountWorkspace,
  type MemberRole,
} from "@/lib/lesson-authoring-contract";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "sign-in" | "sign-up" | "forgot-password";
type AccountTab = "profile" | "email" | "security" | "workspace";

interface AuthPanelProps {
  initialMode?: AuthMode;
  initialTab?: AccountTab;
  inviteToken?: string | null;
  onAuthChanged?: () => void;
}

type ProfileState = {
  avatarUrl: string;
  displayName: string;
  schoolName: string;
  teacherName: string;
  teachingGrade: string;
  teachingLevel: string;
};

type ProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  school_name: string | null;
  teacher_name: string | null;
  teaching_grade: string | null;
  teaching_level: string | null;
};

type LooseProfileClient = {
  from: (table: "profiles") => {
    select: (columns: string) => {
      eq: (
        column: "id",
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: ProfileRow | null; error: Error | null }>;
      };
    };
    update: (values: {
      avatar_url: string | null;
      display_name: string | null;
      school_name: string | null;
      teacher_name: string | null;
      teaching_grade: string | null;
      teaching_level: string | null;
    }) => {
      eq: (column: "id", value: string) => Promise<{ error: Error | null }>;
    };
  };
};

const EMPTY_PROFILE: ProfileState = {
  avatarUrl: "",
  displayName: "",
  schoolName: "",
  teacherName: "",
  teachingGrade: "",
  teachingLevel: "",
};

const TEACHING_GRADE_OPTIONS = [
  { grade: "一年级", level: "水平一" },
  { grade: "二年级", level: "水平一" },
  { grade: "三年级", level: "水平二" },
  { grade: "四年级", level: "水平二" },
  { grade: "五年级", level: "水平三" },
  { grade: "六年级", level: "水平三" },
  { grade: "七年级", level: "水平四" },
  { grade: "八年级", level: "水平四" },
  { grade: "九年级", level: "水平四" },
  { grade: "高中一年级", level: "水平五" },
  { grade: "高中二年级", level: "水平五" },
  { grade: "高中三年级", level: "水平五" },
];

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "所有者",
  admin: "管理员",
  teacher: "教师",
  viewer: "观察者",
};

const INVITATION_STATUS_LABELS: Record<AccountWorkspace["invitations"][number]["status"], string> = {
  accepted: "已接受",
  expired: "已过期",
  pending: "待接受",
  revoked: "已撤销",
};

const MANAGEABLE_ROLES: MemberRole[] = ["owner", "admin", "teacher", "viewer"];

function canManageWorkspace(role: MemberRole) {
  return role === "owner" || role === "admin";
}

function getAppOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function toNullableProfileValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
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
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);
  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [nextEmail, setNextEmail] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [workspaces, setWorkspaces] = useState<AccountWorkspace[]>([]);
  const [workspaceNameDrafts, setWorkspaceNameDrafts] = useState<Record<string, string>>({});
  const [inviteEmailDrafts, setInviteEmailDrafts] = useState<Record<string, string>>({});
  const [inviteRoleDrafts, setInviteRoleDrafts] = useState<Record<string, MemberRole>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [acceptedInviteToken, setAcceptedInviteToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
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

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setActiveTab("security");
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
  }, [onAuthChanged, supabase]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      return;
    }

    let mounted = true;
    const profileClient = supabase as unknown as LooseProfileClient;

    void Promise.resolve()
      .then(() => {
        if (!mounted) {
          return;
        }

        setIsProfileLoading(true);
        return profileClient
          .from("profiles")
          .select("display_name, avatar_url, school_name, teacher_name, teaching_grade, teaching_level")
          .eq("id", session.user.id)
          .maybeSingle();
      })
      .then((result) => {
        if (!mounted || !result) {
          return;
        }

        if (result.error) {
          toast.warning("账户资料读取失败", { description: result.error.message });
        }

        setProfile({
          avatarUrl: result.data?.avatar_url ?? "",
          displayName: result.data?.display_name ?? "",
          schoolName: result.data?.school_name ?? "",
          teacherName: result.data?.teacher_name ?? "",
          teachingGrade: result.data?.teaching_grade ?? "",
          teachingLevel: result.data?.teaching_level ?? "",
        });
      })
      .finally(() => {
        if (mounted) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [session?.user, supabase]);

  const loadWorkspaces = useCallback(async (options?: { silent?: boolean }) => {
    if (!session?.user) {
      setWorkspaces([]);
      setWorkspaceNameDrafts({});
      return;
    }

    setIsWorkspaceLoading(true);

    try {
      const response = await fetch("/api/account/workspaces", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "读取工作区失败。",
        );
      }

      const parsedPayload = accountWorkspacesResponseSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new Error("工作区响应结构不合法。");
      }

      setWorkspaces(parsedPayload.data.workspaces);
      setWorkspaceNameDrafts(
        Object.fromEntries(
          parsedPayload.data.workspaces.map((workspace) => [workspace.id, workspace.name]),
        ),
      );
    } catch (error) {
      if (!options?.silent) {
        toast.error("工作区读取失败", {
          description: error instanceof Error ? error.message : "请稍后重试。",
        });
      }
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    void Promise.resolve().then(() => loadWorkspaces({ silent: true }));
  }, [loadWorkspaces, session?.user]);

  const acceptInvite = useCallback(async (token: string) => {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/account/invitations/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "接受邀请失败。",
        );
      }

      setAcceptedInviteToken(token);
      setActiveTab("workspace");
      toast.success("已加入工作区");
      await loadWorkspaces({ silent: true });
      onAuthChanged?.();
    } catch (error) {
      toast.error("接受邀请失败", {
        description: error instanceof Error ? error.message : "请确认当前登录邮箱与邀请邮箱一致。",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [loadWorkspaces, onAuthChanged]);

  useEffect(() => {
    if (!inviteToken || !session?.user || acceptedInviteToken === inviteToken) {
      return;
    }

    void Promise.resolve().then(() => acceptInvite(inviteToken));
  }, [acceptInvite, acceptedInviteToken, inviteToken, session?.user]);

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

  const saveProfile = async () => {
    if (!supabase || !session?.user || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const profileClient = supabase as unknown as LooseProfileClient;
      const { error } = await profileClient
        .from("profiles")
        .update({
          avatar_url: toNullableProfileValue(profile.avatarUrl),
          display_name: toNullableProfileValue(profile.displayName),
          school_name: toNullableProfileValue(profile.schoolName),
          teacher_name: toNullableProfileValue(profile.teacherName),
          teaching_grade: toNullableProfileValue(profile.teachingGrade),
          teaching_level: toNullableProfileValue(profile.teachingLevel),
        })
        .eq("id", session.user.id);

      if (error) {
        throw error;
      }

      toast.success("账户资料已更新");
      onAuthChanged?.();
    } catch (error) {
      toast.error("资料保存失败", {
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

  const updateWorkspaceName = async (workspaceId: string) => {
    const nextName = workspaceNameDrafts[workspaceId]?.trim();

    if (!nextName) {
      toast.warning("工作区名称不能为空。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/account/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: nextName }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "更新工作区失败。",
        );
      }

      toast.success("工作区名称已更新");
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("工作区更新失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateMemberRole = async (workspaceId: string, userId: string, role: MemberRole) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/account/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "更新成员角色失败。",
        );
      }

      toast.success("成员角色已更新");
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("成员角色更新失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeMember = async (workspaceId: string, userId: string) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/account/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "移除成员失败。",
        );
      }

      toast.success(userId === session?.user.id ? "已退出工作区" : "成员已移除");
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("成员移除失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const createInvitation = async (workspaceId: string) => {
    const email = inviteEmailDrafts[workspaceId]?.trim();
    const role = inviteRoleDrafts[workspaceId] ?? "teacher";

    if (!email) {
      toast.warning("请填写被邀请人的邮箱。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/account/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, role }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "创建邀请失败。",
        );
      }

      const invitationUrl =
        payload && typeof payload === "object" && "invitationUrl" in payload && typeof payload.invitationUrl === "string"
          ? payload.invitationUrl
          : "";
      const emailSent =
        payload && typeof payload === "object" && "emailSent" in payload && payload.emailSent === true;

      setInviteEmailDrafts((drafts) => ({ ...drafts, [workspaceId]: "" }));
      setInviteLinks((links) => ({ ...links, [workspaceId]: invitationUrl }));
      toast.success(emailSent ? "邀请邮件已发送" : "邀请已创建", {
        description: emailSent ? "被邀请人可通过 Supabase 邮件加入。" : "当前未配置 service role，可复制邀请链接发送给对方。",
      });
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("邀请创建失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const revokeInvitation = async (workspaceId: string, invitationId: string) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/account/workspaces/${workspaceId}/invitations/${invitationId}`,
        {
          method: "DELETE",
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "撤销邀请失败。",
        );
      }

      const parsedPayload = workspaceInvitationActionResponseSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new Error("邀请撤销响应结构不合法。");
      }

      toast.success("邀请已撤销");
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("邀请撤销失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendInvitation = async (workspaceId: string, invitationId: string) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/account/workspaces/${workspaceId}/invitations/${invitationId}`,
        {
          method: "POST",
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "重发邀请失败。",
        );
      }

      const parsedPayload = workspaceInvitationActionResponseSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new Error("邀请重发响应结构不合法。");
      }

      if (parsedPayload.data.invitationUrl) {
        setInviteLinks((links) => ({
          ...links,
          [workspaceId]: parsedPayload.data.invitationUrl ?? "",
        }));
      }

      toast.success(parsedPayload.data.emailSent ? "邀请邮件已重发" : "邀请链接已重新生成", {
        description: parsedPayload.data.emailSent
          ? "被邀请人可通过 Supabase 邮件加入。"
          : "当前未配置 service role，可复制新邀请链接发送给对方。",
      });
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("邀请重发失败", {
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

          <TabsContent className="space-y-3" value="profile">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="display-name">
                显示名称
              </label>
              <Input
                disabled={isSubmitting || isProfileLoading}
                id="display-name"
                onChange={(event) =>
                  setProfile((currentProfile) => ({
                    ...currentProfile,
                    displayName: event.target.value,
                  }))
                }
                placeholder="例如：王老师"
                value={profile.displayName}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="teacher-name">
                  教师姓名
                </label>
                <Input
                  disabled={isSubmitting || isProfileLoading}
                  id="teacher-name"
                  onChange={(event) =>
                    setProfile((currentProfile) => ({
                      ...currentProfile,
                      teacherName: event.target.value,
                    }))
                  }
                  placeholder="例如：王明"
                  value={profile.teacherName}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="school-name">
                  学校名称
                </label>
                <Input
                  disabled={isSubmitting || isProfileLoading}
                  id="school-name"
                  onChange={(event) =>
                    setProfile((currentProfile) => ({
                      ...currentProfile,
                      schoolName: event.target.value,
                    }))
                  }
                  placeholder="例如：深圳市XX小学"
                  value={profile.schoolName}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="teaching-grade">
                  任教年级
                </label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={isSubmitting || isProfileLoading}
                  id="teaching-grade"
                  onChange={(event) => {
                    const selectedGrade = event.target.value;
                    const selectedOption = TEACHING_GRADE_OPTIONS.find(
                      (option) => option.grade === selectedGrade,
                    );

                    setProfile((currentProfile) => ({
                      ...currentProfile,
                      teachingGrade: selectedGrade,
                      teachingLevel: selectedOption?.level ?? currentProfile.teachingLevel,
                    }));
                  }}
                  value={profile.teachingGrade}
                >
                  <option value="">请选择年级</option>
                  {TEACHING_GRADE_OPTIONS.map((option) => (
                    <option key={option.grade} value={option.grade}>
                      {option.grade}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="teaching-level">
                  水平学段
                </label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={isSubmitting || isProfileLoading}
                  id="teaching-level"
                  onChange={(event) =>
                    setProfile((currentProfile) => ({
                      ...currentProfile,
                      teachingLevel: event.target.value,
                    }))
                  }
                  value={profile.teachingLevel}
                >
                  <option value="">请选择水平</option>
                  {["水平一", "水平二", "水平三", "水平四", "水平五"].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              保存后，后续生成教案会自动填入“授课教师：学校 姓名”和“—水平·年级”。
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="avatar-url">
                头像 URL
              </label>
              <Input
                disabled={isSubmitting || isProfileLoading}
                id="avatar-url"
                onChange={(event) =>
                  setProfile((currentProfile) => ({
                    ...currentProfile,
                    avatarUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
                type="url"
                value={profile.avatarUrl}
              />
            </div>
            <Button
              className="w-full"
              disabled={isSubmitting || isProfileLoading}
              onClick={() => void saveProfile()}
              type="button"
              variant="brand"
            >
              保存资料
            </Button>
          </TabsContent>

          <TabsContent className="space-y-3" value="email">
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
              onClick={() => void updateEmail()}
              type="button"
              variant="brand"
            >
              发送邮箱变更确认
            </Button>
          </TabsContent>

          <TabsContent className="space-y-3" value="security">
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
              onClick={() => void updatePassword()}
              type="button"
              variant="brand"
            >
              更新密码
            </Button>
          </TabsContent>

          <TabsContent className="space-y-4" value="workspace">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs leading-5 text-muted-foreground">
                工作区、成员权限和邀请状态由 Supabase RLS 与数据库 RPC 保护；关键操作会进入审计日志。
              </p>
              <Button
                disabled={isWorkspaceLoading || isSubmitting}
                onClick={() => void loadWorkspaces()}
                size="sm"
                type="button"
                variant="outline"
              >
                刷新
              </Button>
            </div>

            {isWorkspaceLoading ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                正在读取工作区...
              </div>
            ) : null}

            {!isWorkspaceLoading && !workspaces.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                当前账号还没有工作区。创建项目时会自动生成个人工作区。
              </div>
            ) : null}

            {workspaces.map((workspace) => {
              const isManager = canManageWorkspace(workspace.currentUserRole);

              return (
                <div className="space-y-3 rounded-2xl border border-border bg-card p-4" key={workspace.id}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{workspace.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          我的角色：{ROLE_LABELS[workspace.currentUserRole]}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {workspace.members.length} 人
                      </span>
                    </div>
                    {isManager ? (
                      <div className="flex gap-2">
                        <Input
                          disabled={isSubmitting}
                          onChange={(event) =>
                            setWorkspaceNameDrafts((drafts) => ({
                              ...drafts,
                              [workspace.id]: event.target.value,
                            }))
                          }
                          value={workspaceNameDrafts[workspace.id] ?? workspace.name}
                        />
                        <Button
                          disabled={isSubmitting}
                          onClick={() => void updateWorkspaceName(workspace.id)}
                          type="button"
                          variant="outline"
                        >
                          保存
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {isManager ? (
                    <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-3">
                      <p className="text-xs font-medium text-foreground">邀请成员</p>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                        <Input
                          disabled={isSubmitting}
                          onChange={(event) =>
                            setInviteEmailDrafts((drafts) => ({
                              ...drafts,
                              [workspace.id]: event.target.value,
                            }))
                          }
                          placeholder="member@example.com"
                          type="email"
                          value={inviteEmailDrafts[workspace.id] ?? ""}
                        />
                        <select
                          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                          disabled={isSubmitting}
                          onChange={(event) =>
                            setInviteRoleDrafts((drafts) => ({
                              ...drafts,
                              [workspace.id]: event.target.value as MemberRole,
                            }))
                          }
                          value={inviteRoleDrafts[workspace.id] ?? "teacher"}
                        >
                          {(["admin", "teacher", "viewer"] satisfies MemberRole[]).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        <Button
                          disabled={isSubmitting}
                          onClick={() => void createInvitation(workspace.id)}
                          type="button"
                          variant="brand"
                        >
                          邀请
                        </Button>
                      </div>
                      {inviteLinks[workspace.id] ? (
                        <div className="rounded-lg bg-background p-2 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">邀请链接</p>
                          <p className="mt-1 break-all">{inviteLinks[workspace.id]}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {workspace.members.map((member) => {
                      const isCurrentUser = member.userId === session.user.id;
                      const canChangeRole = isManager && !isCurrentUser;
                      const canRemove =
                        (isManager && !isCurrentUser) ||
                        (isCurrentUser && workspace.currentUserRole !== "owner");

                      return (
                        <div
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2"
                          key={member.userId}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {member.profile.displayName ?? member.userId}
                              {isCurrentUser ? "（我）" : ""}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {member.userId}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                              disabled={!canChangeRole || isSubmitting}
                              onChange={(event) =>
                                void updateMemberRole(
                                  workspace.id,
                                  member.userId,
                                  event.target.value as MemberRole,
                                )
                              }
                              value={member.role}
                            >
                              {MANAGEABLE_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </select>
                            {canRemove ? (
                              <Button
                                disabled={isSubmitting}
                                onClick={() => void removeMember(workspace.id, member.userId)}
                                size="icon-sm"
                                type="button"
                                variant="outline"
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">移除成员</span>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {workspace.invitations.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">邀请记录</p>
                      {workspace.invitations.map((invitation) => (
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs"
                          key={invitation.id}
                        >
                          <span className="truncate text-foreground">{invitation.email}</span>
                          <span className="text-muted-foreground">
                            {ROLE_LABELS[invitation.role]} · {INVITATION_STATUS_LABELS[invitation.status]} · 到期 {new Date(invitation.expiresAt).toLocaleDateString("zh-CN")}
                          </span>
                          {isManager && (invitation.status === "pending" || invitation.status === "expired") ? (
                            <div className="flex items-center gap-2">
                              <Button
                                disabled={isSubmitting}
                                onClick={() => void resendInvitation(workspace.id, invitation.id)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                重发
                              </Button>
                              {invitation.status === "pending" ? (
                                <Button
                                  disabled={isSubmitting}
                                  onClick={() => void revokeInvitation(workspace.id, invitation.id)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  撤销
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
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
                void submit();
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
        onClick={() => void submit()}
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
