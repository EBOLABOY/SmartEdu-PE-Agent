import { Suspense } from "react";

import SmartEduWorkspace from "@/components/workspace/SmartEduWorkspace";

function WorkspaceFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-3xl border border-border/80 bg-card/90 p-6 text-center shadow-xs">
        <div className="mx-auto size-10 animate-pulse rounded-2xl bg-brand/15" />
        <h1 className="mt-4 text-base font-semibold text-foreground">正在打开课堂工作台</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          正在恢复项目、会话和课时计划状态。
        </p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <SmartEduWorkspace />
    </Suspense>
  );
}
