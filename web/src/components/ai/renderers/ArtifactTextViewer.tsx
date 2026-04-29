"use client";

import { AutoScrollArea } from "@/components/ai-elements/auto-scroll";
import { MessageResponse } from "@/components/ai-elements/message";
import { StateNotice } from "@/components/ui/state-surface";

interface ArtifactTextViewerProps {
  content: string;
  emptyDescription?: string;
  emptyTitle?: string;
  isStreaming?: boolean;
}

export default function ArtifactTextViewer({
  content,
  emptyDescription,
  emptyTitle,
  isStreaming = false,
}: ArtifactTextViewerProps) {
  const normalizedContent = content.trim();
  const resolvedEmptyTitle =
    emptyTitle ?? (isStreaming ? "等待 JSON 首包" : "等待课时计划生成");
  const resolvedEmptyDescription =
    emptyDescription ??
    (isStreaming
      ? "请求已进入模型流。收到第一段 JSON 后，这里会直接追加显示，不再切换到生成动画。"
      : "请输入课程主题，系统会先生成可审阅的结构化课时计划；确认课时计划无误后，再生成互动大屏。");

  return (
    <AutoScrollArea
      className="h-full w-full bg-card text-foreground"
      contentClassName="p-8"
      scrollClassName="overflow-y-auto"
    >
      <div className="competition-lesson-preview mx-auto max-w-4xl leading-relaxed">
        {normalizedContent ? (
          <MessageResponse>{normalizedContent}</MessageResponse>
        ) : (
          <StateNotice
            className="flex min-h-[420px] items-center justify-center"
            description={resolvedEmptyDescription}
            layout="center"
            title={resolvedEmptyTitle}
            tone={isStreaming ? "brand" : "neutral"}
          />
        )}
      </div>
    </AutoScrollArea>
  );
}
