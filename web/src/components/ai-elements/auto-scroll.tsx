"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { StickToBottom, type StickToBottomProps } from "use-stick-to-bottom";

export type AutoScrollAreaProps = Omit<StickToBottomProps, "children"> & {
  children: ReactNode;
  contentClassName?: string;
  scrollClassName?: string;
};

export function AutoScrollArea({
  children,
  className,
  contentClassName,
  scrollClassName,
  initial = "smooth",
  resize = "smooth",
  ...props
}: AutoScrollAreaProps) {
  return (
    <StickToBottom
      className={cn("relative overflow-y-hidden", className)}
      initial={initial}
      resize={resize}
      {...props}
    >
      <StickToBottom.Content
        className={contentClassName}
        scrollClassName={cn("overflow-auto", scrollClassName)}
      >
        {children}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
