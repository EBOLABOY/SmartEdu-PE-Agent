"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export default function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const label = isDark ? "切换到浅色模式" : "切换到深色模式";
  const Icon = isDark ? Sun : Moon;

  return (
    <Button
      aria-label={label}
      className={cn(
        compact
          ? "size-10 rounded-xl border-border/80 bg-background/80 p-0"
          : "h-9 rounded-full border-border/80 bg-background/80 px-3",
        className,
      )}
      onClick={() => setTheme(nextTheme)}
      size={compact ? "icon" : "sm"}
      title={label}
      type="button"
      variant="outline"
    >
      <Icon className="size-4" />
      {compact ? null : <span>{isDark ? "浅色" : "深色"}</span>}
    </Button>
  );
}
