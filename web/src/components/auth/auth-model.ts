import type { AccountWorkspace, MemberRole } from "@/lib/lesson-authoring-contract";

export type AuthMode = "sign-in" | "sign-up" | "forgot-password";
export type AccountTab = "profile" | "email" | "security" | "workspace";

export type ProfileState = {
  avatarUrl: string;
  displayName: string;
  schoolName: string;
  teacherName: string;
  teachingGrade: string;
  teachingLevel: string;
};

export const EMPTY_PROFILE: ProfileState = {
  avatarUrl: "",
  displayName: "",
  schoolName: "",
  teacherName: "",
  teachingGrade: "",
  teachingLevel: "",
};

export const TEACHING_GRADE_OPTIONS = [
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

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "所有者",
  admin: "管理员",
  teacher: "教师",
  viewer: "观察者",
};

export const INVITATION_STATUS_LABELS: Record<AccountWorkspace["invitations"][number]["status"], string> = {
  accepted: "已接受",
  expired: "已过期",
  pending: "待接受",
  revoked: "已撤销",
};

export const MANAGEABLE_ROLES: MemberRole[] = ["owner", "admin", "teacher", "viewer"];

export function canManageWorkspace(role: MemberRole) {
  return role === "owner" || role === "admin";
}

export function getAppOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function toNullableProfileValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}
