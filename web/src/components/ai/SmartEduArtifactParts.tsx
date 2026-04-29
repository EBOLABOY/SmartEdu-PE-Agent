import {
  AlertCircle,
  Check,
  Clock,
  Loader2,
  MonitorPlay,
  Sparkles,
} from "lucide-react";
import type React from "react";

import type { ArtifactLifecycleStatus, ArtifactSnapshot } from "@/components/ai/artifact-model";
import { Badge } from "@/components/ui/badge";
import { SelectableSurface, StateSurface } from "@/components/ui/state-surface";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<ArtifactLifecycleStatus, string> = {
  idle: "等待输入",
  streaming: "生成中",
  ready: "已就绪",
  editing: "编辑中",
  error: "异常",
};

const STATUS_ICONS = {
  idle: Clock,
  streaming: Loader2,
  ready: Check,
  editing: Clock,
  error: AlertCircle,
} satisfies Record<ArtifactLifecycleStatus, React.ComponentType<{ className?: string }>>;

export function LessonStartGuide() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/25 p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-border/80 bg-card/95 p-8 text-center shadow-xs">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand">
          <Sparkles className="size-6" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">开始创建体育课</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          在左侧输入课程主题，AI 会先生成可审阅课时计划。确认课时计划后，再生成适合课堂投屏的互动大屏。
        </p>
        <StateSurface className="mt-6 text-left" density="compact" tone="brand">
          示例：三年级篮球运球接力，40 人，20 个篮球，半个篮球场，课堂时长 40 分钟。
        </StateSurface>
      </div>
    </div>
  );
}

export function CanvasPendingGuide({ hasLesson }: { hasLesson: boolean }) {
  return (
    <div className="flex h-full items-center justify-center bg-background/50 p-6">
      <div className="w-full max-w-xl rounded-3xl border border-border/80 bg-card/95 p-7 text-center shadow-xs">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border/80 bg-background/70 text-muted-foreground">
          <MonitorPlay className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">互动大屏尚未生成</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {hasLesson
            ? "请先确认课时计划，系统会继续生成课堂投屏画面。"
            : "请先在左侧输入课程主题，生成并确认课时计划后，这里会显示课堂投屏画面。"}
        </p>
      </div>
    </div>
  );
}

export function StatusBadge({
  status,
  label,
}: {
  status: ArtifactLifecycleStatus;
  label: string;
}) {
  const Icon = STATUS_ICONS[status];

  return (
    <Badge
      variant={
        status === "ready"
          ? "success"
          : status === "streaming" || status === "editing"
            ? "warning"
            : status === "error"
              ? "destructive"
              : "secondary"
      }
    >
      <Icon className={cn("mr-1 size-3.5", status === "streaming" ? "animate-spin" : "")} />
      {label}
    </Badge>
  );
}

export function formatSnapshotTime(snapshot: ArtifactSnapshot) {
  if (!snapshot.createdAt) {
    return "刚刚更新";
  }

  return new Date(snapshot.createdAt).toLocaleString("zh-CN");
}

export function VersionItem({
  snapshot,
  isSelected,
  onSelect,
}: {
  snapshot: ArtifactSnapshot;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <SelectableSurface active={isSelected} onClick={onSelect}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">{snapshot.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {snapshot.stage === "lesson" ? "课时计划" : "互动大屏"} · v{snapshot.version}
            </p>
          </div>
          <StatusBadge label={STATUS_LABELS[snapshot.status]} status={snapshot.status} />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{formatSnapshotTime(snapshot)}</span>
          {snapshot.isCurrent ? <Badge variant="success">当前版本</Badge> : null}
        </div>
      </div>
    </SelectableSurface>
  );
}

export { STATUS_LABELS };
