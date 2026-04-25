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
      <div data-slot="tabs" className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      role="tablist"
      {...props}
    />
  );
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
      data-slot="tabs-trigger"
      data-state={selected ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
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

  return (
    <div
      data-slot="tabs-content"
      data-state="active"
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      role="tabpanel"
      {...props}
    />
  );
}
