"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = React.useContext(TabsContext);

  if (!context) {
    throw new Error("Tabs components must be used within <Tabs>.");
  }

  return context;
}

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement> & TabsContextValue) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-end gap-4", className)} role="tablist" {...props} />;
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = useTabsContext();
  const selected = context.value === value;

  return (
    <button
      aria-selected={selected}
      className={cn(
        "border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900",
        selected && "border-neutral-950 text-neutral-950",
        className,
      )}
      onClick={() => context.onValueChange(value)}
      role="tab"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = useTabsContext();

  if (context.value !== value) {
    return null;
  }

  return <div className={cn("h-full", className)} role="tabpanel" {...props} />;
}
