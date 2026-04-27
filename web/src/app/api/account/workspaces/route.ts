import {
  accountWorkspacesResponseSchema,
} from "@/lib/lesson-authoring-contract";
import { toIsoDateTime } from "@/lib/date-time";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

type MemberRole = "owner" | "admin" | "teacher" | "viewer";

type OrganizationRow = {
  created_at: string;
  id: string;
  name: string;
  slug: string | null;
  updated_at: string;
};

type OrganizationMemberRow = {
  created_at: string;
  organization_id: string;
  role: MemberRole;
  user_id: string;
};

type OrganizationInvitationRow = {
  created_at: string;
  email: string;
  expires_at: string;
  id: string;
  organization_id: string;
  role: MemberRole;
  status: "pending" | "accepted" | "revoked" | "expired";
};

type ProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  id: string;
};

export async function GET() {
  if (!hasSupabasePublicEnv()) {
    return Response.json(
      accountWorkspacesResponseSchema.parse({
        workspaces: [],
        persistence: {
          enabled: false,
          authenticated: false,
          reason: "missing-supabase-env",
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return Response.json(
      accountWorkspacesResponseSchema.parse({
        workspaces: [],
        persistence: {
          enabled: false,
          authenticated: false,
          reason: "supabase-client-unavailable",
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json(
      accountWorkspacesResponseSchema.parse({
        workspaces: [],
        persistence: {
          enabled: true,
          authenticated: false,
          reason: "missing-auth-session",
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  try {
    const { data: membershipRows, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id, user_id, role, created_at");

    if (membershipError) {
      throw membershipError;
    }

    const memberships = (membershipRows ?? []) as OrganizationMemberRow[];
    const organizationIds = Array.from(new Set(memberships.map((member) => member.organization_id)));
    const userIds = Array.from(new Set(memberships.map((member) => member.user_id)));

    if (!organizationIds.length) {
      return Response.json(
        accountWorkspacesResponseSchema.parse({
          workspaces: [],
          persistence: {
            enabled: true,
            authenticated: true,
          },
        }),
        {
          headers: {
            "cache-control": "no-store",
          },
        },
      );
    }

    const { data: organizationRows, error: organizationError } = await supabase
      .from("organizations")
      .select("id, name, slug, created_at, updated_at")
      .in("id", organizationIds)
      .order("updated_at", { ascending: false });

    if (organizationError) {
      throw organizationError;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    if (profileError) {
      throw profileError;
    }

    const { data: invitationRows, error: invitationError } = await supabase
      .from("organization_invitations")
      .select("id, organization_id, email, role, status, expires_at, created_at")
      .in("organization_id", organizationIds)
      .order("created_at", { ascending: false });

    if (invitationError) {
      throw invitationError;
    }

    const organizations = (organizationRows ?? []) as OrganizationRow[];
    const profilesById = new Map(
      ((profileRows ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    const invitations = (invitationRows ?? []) as OrganizationInvitationRow[];

    const workspaces = organizations.map((organization) => {
      const workspaceMembers = memberships.filter(
        (member) => member.organization_id === organization.id,
      );
      const currentUserRole =
        workspaceMembers.find((member) => member.user_id === user.id)?.role ?? "viewer";

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: toIsoDateTime(organization.created_at, "organizations.created_at"),
        updatedAt: toIsoDateTime(organization.updated_at, "organizations.updated_at"),
        currentUserRole,
        invitations: invitations
          .filter((invitation) => invitation.organization_id === organization.id)
          .map((invitation) => ({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: toIsoDateTime(
              invitation.expires_at,
              "organization_invitations.expires_at",
            ),
            createdAt: toIsoDateTime(
              invitation.created_at,
              "organization_invitations.created_at",
            ),
          })),
        members: workspaceMembers
          .sort((left, right) => {
            const roleRank: Record<MemberRole, number> = {
              owner: 0,
              admin: 1,
              teacher: 2,
              viewer: 3,
            };
            return roleRank[left.role] - roleRank[right.role] || left.created_at.localeCompare(right.created_at);
          })
          .map((member) => {
            const profile = profilesById.get(member.user_id);
            return {
              userId: member.user_id,
              role: member.role,
              createdAt: toIsoDateTime(member.created_at, "organization_members.created_at"),
              profile: {
                displayName: profile?.display_name ?? null,
                avatarUrl: profile?.avatar_url ?? null,
              },
            };
          }),
      };
    });

    return Response.json(
      accountWorkspacesResponseSchema.parse({
        workspaces,
        persistence: {
          enabled: true,
          authenticated: true,
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "读取工作区失败。",
      },
      { status: 500 },
    );
  }
}
