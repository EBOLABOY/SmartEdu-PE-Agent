import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const stateSurfaceVariants = cva("rounded-2xl border text-sm shadow-xs", {
  variants: {
    align: {
      center: "text-center",
      start: "text-left",
    },
    density: {
      compact: "px-3 py-2",
      default: "p-4",
      relaxed: "px-4 py-5",
      spacious: "p-8",
    },
    edge: {
      dashed: "border-dashed",
      solid: "border-solid",
    },
    tone: {
      brand: "border-brand/35 bg-brand/10 text-muted-foreground",
      danger: "border-destructive/25 bg-destructive/10 text-destructive",
      neutral: "border-border/80 bg-muted/35 text-muted-foreground",
      plain: "border-border/80 bg-card text-muted-foreground",
    },
  },
  defaultVariants: {
    align: "start",
    density: "default",
    edge: "solid",
    tone: "neutral",
  },
});

type StateSurfaceProps = React.ComponentProps<"div"> &
  VariantProps<typeof stateSurfaceVariants>;

function StateSurface({
  align,
  className,
  density,
  edge,
  tone,
  ...props
}: StateSurfaceProps) {
  return (
    <div
      data-slot="state-surface"
      className={cn(stateSurfaceVariants({ align, density, edge, tone, className }))}
      {...props}
    />
  );
}

type StateNoticeProps = Omit<StateSurfaceProps, "children" | "title"> & {
  action?: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  layout?: "center" | "inline";
  title: React.ReactNode;
};

function StateNotice({
  action,
  align,
  className,
  description,
  layout = "inline",
  icon: Icon,
  title,
  tone = "neutral",
  ...props
}: StateNoticeProps) {
  const isCentered = layout === "center";

  return (
    <StateSurface
      align={align ?? (isCentered ? "center" : "start")}
      className={className}
      density="relaxed"
      tone={tone}
      {...props}
    >
      <div className={cn("flex gap-3", isCentered ? "flex-col items-center" : "items-start")}>
        {Icon ? (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-2xl",
              tone === "brand" ? "bg-brand/15 text-brand" : "bg-card text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-xs leading-5">{description}</p>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </StateSurface>
  );
}

function StateLoading({
  className,
  label,
}: {
  className?: string;
  label: React.ReactNode;
}) {
  return (
    <StateSurface className={className} density="relaxed">
      <span className="inline-flex items-center gap-2">
        <span className="size-2 animate-pulse rounded-full bg-brand" />
        {label}
      </span>
    </StateSurface>
  );
}

function getSelectableSurfaceClassName(active: boolean, className?: string) {
  return cn(
    "w-full rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
    active
      ? "border-brand/55 bg-brand/10 text-foreground"
      : "border-border/80 bg-card hover:border-brand/30 hover:bg-accent/45",
    className,
  );
}

function SelectableSurface({
  active = false,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean;
}) {
  return (
    <button
      data-active={active || undefined}
      data-slot="selectable-surface"
      className={getSelectableSurfaceClassName(active, className)}
      type="button"
      {...props}
    />
  );
}

function SelectableSurfaceLink({
  active = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  active?: boolean;
}) {
  return (
    <a
      data-active={active || undefined}
      data-slot="selectable-surface-link"
      className={getSelectableSurfaceClassName(active, className)}
      {...props}
    />
  );
}

export {
  SelectableSurface,
  SelectableSurfaceLink,
  StateLoading,
  StateNotice,
  StateSurface,
  stateSurfaceVariants,
};
