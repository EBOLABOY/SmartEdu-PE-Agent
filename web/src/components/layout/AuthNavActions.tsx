"use client";

import { UserCircle } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/lib/supabase/use-auth-session";
import { cn } from "@/lib/utils";

interface AuthNavActionsProps {
  accountLabel?: string;
  accountMode?: "icon" | "text";
  className?: string;
  registerVariant?: "brand" | "outline";
}

export default function AuthNavActions({
  accountLabel = "账户后台",
  accountMode = "text",
  className,
  registerVariant = "brand",
}: AuthNavActionsProps) {
  const { status } = useAuthSession();

  if (status === "loading") {
    return <div aria-hidden className={cn("h-8 w-28", className)} />;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {status === "authenticated" ? (
        <Link
          aria-label={accountLabel}
          className={buttonVariants({
            size: accountMode === "icon" ? "icon-sm" : "sm",
            variant: accountMode === "icon" ? "ghost" : "brand",
          })}
          href="/account"
        >
          {accountMode === "icon" ? <UserCircle aria-hidden size={20} strokeWidth={2} /> : accountLabel}
        </Link>
      ) : (
        <>
          <Link className={buttonVariants({ size: "sm", variant: "ghost" })} href="/login">
            登录
          </Link>
          <Link className={buttonVariants({ size: "sm", variant: registerVariant })} href="/register">
            注册
          </Link>
        </>
      )}
    </div>
  );
}
