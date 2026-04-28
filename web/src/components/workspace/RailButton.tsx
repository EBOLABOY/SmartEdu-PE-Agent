"use client";

import type React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RailButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
  label: string;
  onClick?: () => void;
}

export default function RailButton({
  icon: Icon,
  label,
  onClick,
  isActive,
}: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "flex size-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            isActive
              ? "border-brand/45 bg-brand/12 text-brand"
              : "border-transparent text-muted-foreground hover:border-border/80 hover:bg-accent/60 hover:text-foreground",
          )}
          onClick={onClick}
          type="button"
        >
          <Icon className="size-[18px]" />
          <span className="sr-only">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
