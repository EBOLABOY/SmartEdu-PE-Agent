"use client";

import { Trash2 } from "lucide-react";
import { type Dispatch, type SetStateAction } from "react";

import {
  INVITATION_STATUS_LABELS,
  MANAGEABLE_ROLES,
  ROLE_LABELS,
  canManageWorkspace,
} from "@/components/auth/auth-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StateLoading, StateNotice } from "@/components/ui/state-surface";
import type { AccountWorkspace, MemberRole } from "@/lib/lesson/authoring-contract";

interface WorkspaceTabProps {
  createInvitation: (workspaceId: string) => Promise<void>;
  currentUserId: string;
  inviteEmailDrafts: Record<string, string>;
  inviteLinks: Record<string, string>;
  inviteRoleDrafts: Record<string, MemberRole>;
  isSubmitting: boolean;
  isWorkspaceLoading: boolean;
  loadWorkspaces: () => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
  resendInvitation: (workspaceId: string, invitationId: string) => Promise<void>;
  revokeInvitation: (workspaceId: string, invitationId: string) => Promise<void>;
  setInviteEmailDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setInviteRoleDrafts: Dispatch<SetStateAction<Record<string, MemberRole>>>;
  setWorkspaceNameDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  updateMemberRole: (workspaceId: string, userId: string, role: MemberRole) => Promise<void>;
  updateWorkspaceName: (workspaceId: string) => Promise<void>;
  workspaceNameDrafts: Record<string, string>;
  workspaces: AccountWorkspace[];
}

export default function WorkspaceTab({
  createInvitation,
  currentUserId,
  inviteEmailDrafts,
  inviteLinks,
  inviteRoleDrafts,
  isSubmitting,
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
}: WorkspaceTabProps) {
  return (
    <div className="space-y-4">
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
        <StateLoading label="正在读取工作区..." />
      ) : null}

      {!isWorkspaceLoading && !workspaces.length ? (
        <StateNotice
          description="创建项目时会自动生成个人工作区，成员权限和邀请记录会在这里集中管理。"
          title="当前账号还没有工作区"
        />
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
                <div className="space-y-2 rounded-xl border border-border bg-background p-3">
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
                const isCurrentUser = member.userId === currentUserId;
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
    </div>
  );
}
