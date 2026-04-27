"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import {
  accountWorkspacesResponseSchema,
  workspaceInvitationActionResponseSchema,
  type AccountWorkspace,
  type MemberRole,
} from "@/lib/lesson-authoring-contract";

interface UseAccountWorkspacesInput {
  inviteToken?: string | null;
  onAuthChanged?: () => void;
  onInviteAccepted?: () => void;
  setIsSubmitting: Dispatch<SetStateAction<boolean>>;
  userId?: string;
}

function getResponseError(payload: unknown, fallback: string) {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export function useAccountWorkspaces({
  inviteToken,
  onAuthChanged,
  onInviteAccepted,
  setIsSubmitting,
  userId,
}: UseAccountWorkspacesInput) {
  const [workspaces, setWorkspaces] = useState<AccountWorkspace[]>([]);
  const [workspaceNameDrafts, setWorkspaceNameDrafts] = useState<Record<string, string>>({});
  const [inviteEmailDrafts, setInviteEmailDrafts] = useState<Record<string, string>>({});
  const [inviteRoleDrafts, setInviteRoleDrafts] = useState<Record<string, MemberRole>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [acceptedInviteToken, setAcceptedInviteToken] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);

  const loadWorkspaces = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
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
        throw new Error(getResponseError(payload, "读取工作区失败。"));
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
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    void Promise.resolve().then(() => loadWorkspaces({ silent: true }));
  }, [loadWorkspaces, userId]);

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
        throw new Error(getResponseError(payload, "接受邀请失败。"));
      }

      setAcceptedInviteToken(token);
      onInviteAccepted?.();
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
  }, [loadWorkspaces, onAuthChanged, onInviteAccepted, setIsSubmitting]);

  useEffect(() => {
    if (!inviteToken || !userId || acceptedInviteToken === inviteToken) {
      return;
    }

    void Promise.resolve().then(() => acceptInvite(inviteToken));
  }, [acceptInvite, acceptedInviteToken, inviteToken, userId]);

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
        throw new Error(getResponseError(payload, "更新工作区失败。"));
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

  const updateMemberRole = async (workspaceId: string, targetUserId: string, role: MemberRole) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/account/workspaces/${workspaceId}/members/${targetUserId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getResponseError(payload, "更新成员权限失败。"));
      }

      toast.success("成员权限已更新");
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("成员权限更新失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeMember = async (workspaceId: string, targetUserId: string) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/account/workspaces/${workspaceId}/members/${targetUserId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getResponseError(payload, "移除成员失败。"));
      }

      toast.success(targetUserId === userId ? "已退出工作区" : "成员已移除");
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
      toast.warning("请填写邀请邮箱。");
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
        throw new Error(getResponseError(payload, "创建邀请失败。"));
      }

      const invitationUrl =
        payload &&
        typeof payload === "object" &&
        "invitationUrl" in payload &&
        typeof payload.invitationUrl === "string"
          ? payload.invitationUrl
          : "";

      setInviteEmailDrafts((drafts) => ({ ...drafts, [workspaceId]: "" }));
      setInviteLinks((links) => ({ ...links, [workspaceId]: invitationUrl }));
      toast.success("邀请已创建", {
        description: invitationUrl ? "邀请链接已生成，也会尝试通过邮件发送。" : undefined,
      });
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("创建邀请失败", {
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
        throw new Error(getResponseError(payload, "撤销邀请失败。"));
      }

      const parsedPayload = workspaceInvitationActionResponseSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new Error("邀请操作响应结构不合法。");
      }

      toast.success("邀请已撤销");
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("撤销邀请失败", {
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
        throw new Error(getResponseError(payload, "重发邀请失败。"));
      }

      const parsedPayload = workspaceInvitationActionResponseSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new Error("邀请操作响应结构不合法。");
      }

      setInviteLinks((links) => ({
        ...links,
        [workspaceId]: parsedPayload.data.invitationUrl ?? "",
      }));
      toast.success("邀请已重发", {
        description: parsedPayload.data.emailSent === false ? "邮件未发送，但邀请链接已更新。" : undefined,
      });
      await loadWorkspaces({ silent: true });
    } catch (error) {
      toast.error("重发邀请失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
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
  };
}
