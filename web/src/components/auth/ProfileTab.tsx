"use client";

import { type Dispatch, type SetStateAction } from "react";

import {
  TEACHING_GRADE_OPTIONS,
  type ProfileState,
} from "@/components/auth/auth-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProfileTabProps {
  isProfileLoading: boolean;
  isSubmitting: boolean;
  onSave: () => void;
  profile: ProfileState;
  setProfile: Dispatch<SetStateAction<ProfileState>>;
}

export default function ProfileTab({
  isProfileLoading,
  isSubmitting,
  onSave,
  profile,
  setProfile,
}: ProfileTabProps) {
  return (
    <div className="space-y-3">
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
        保存后，后续生成课时计划会自动填入“授课教师：学校 姓名”和“——水平·年级”。
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
        onClick={onSave}
        type="button"
        variant="brand"
      >
        保存资料
      </Button>
    </div>
  );
}
