"use client";

import * as React from "react";
import { Check, Clock, Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ArtifactStatus = "idle" | "streaming" | "ready" | "editing" | "error";

const statusIconMap: Record<ArtifactStatus, React.ComponentType<{ className?: string }>> = {
  idle: Clock,
  streaming: Loader2,
  ready: Check,
  editing: Clock,
  error: Clock,
};

export function Artifact({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-neutral-50 text-neutral-950",
        className,
      )}
      {...props}
    />
  );
}

export function ArtifactHeader({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <header
      className={cn(
        "flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white/95 px-5 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

export function ArtifactTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("truncate text-sm font-semibold text-neutral-950", className)} {...props} />;
}

export function ArtifactDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("truncate text-xs text-neutral-500", className)} {...props} />;
}

export function ArtifactActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 items-center gap-2", className)} {...props} />;
}

export function ArtifactAction({ className, variant = "ghost", size = "sm", ...props }: ButtonProps) {
  return <Button className={cn("rounded-lg", className)} size={size} variant={variant} {...props} />;
}

export function ArtifactBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-hidden", className)} {...props} />;
}

export function ArtifactContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-full min-h-0 overflow-hidden", className)} {...props} />;
}

export function ArtifactEmpty({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500",
        className,
      )}
      {...props}
    />
  );
}

export function ArtifactStatus({
  status,
  label,
  className,
}: {
  status: ArtifactStatus;
  label: string;
  className?: string;
}) {
  const Icon = statusIconMap[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600",
        status === "ready" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        (status === "streaming" || status === "editing") && "border-amber-200 bg-amber-50 text-amber-800",
        status === "error" && "border-red-200 bg-red-50 text-red-700",
        className,
      )}
    >
      <Icon className={cn("size-3.5", status === "streaming" && "animate-spin")} />
      {label}
    </div>
  );
}
