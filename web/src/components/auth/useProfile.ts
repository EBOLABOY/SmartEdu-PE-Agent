"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { EMPTY_PROFILE, toNullableProfileValue, type ProfileState } from "@/components/auth/auth-model";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

interface UseProfileInput {
  isSubmitting: boolean;
  onProfileSaved?: () => void;
  setIsSubmitting: Dispatch<SetStateAction<boolean>>;
  supabase: SmartEduSupabaseClient | null;
  userId?: string;
}

export function useProfile({
  isSubmitting,
  onProfileSaved,
  setIsSubmitting,
  supabase,
  userId,
}: UseProfileInput) {
  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !userId) {
      return;
    }

    let mounted = true;
    const client = supabase;
    const profileUserId = userId;

    async function loadProfile() {
      try {
        if (!mounted) {
          return;
        }

        setIsProfileLoading(true);

        const result = await client
          .from("profiles")
          .select("display_name, avatar_url, school_name, teacher_name, teaching_grade, teaching_level")
          .eq("id", profileUserId)
          .maybeSingle();

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
      } finally {
        if (mounted) {
          setIsProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [supabase, userId]);

  const saveProfile = async () => {
    if (!supabase || !userId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          avatar_url: toNullableProfileValue(profile.avatarUrl),
          display_name: toNullableProfileValue(profile.displayName),
          school_name: toNullableProfileValue(profile.schoolName),
          teacher_name: toNullableProfileValue(profile.teacherName),
          teaching_grade: toNullableProfileValue(profile.teachingGrade),
          teaching_level: toNullableProfileValue(profile.teachingLevel),
        })
        .eq("id", userId);

      if (error) {
        throw error;
      }

      toast.success("账户资料已更新");
      onProfileSaved?.();
    } catch (error) {
      toast.error("资料保存失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return { isProfileLoading, profile, saveProfile, setProfile };
}
