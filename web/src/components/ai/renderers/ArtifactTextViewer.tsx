import { useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { AutoScrollArea } from "@/components/ai-elements/auto-scroll";
import { MessageResponse } from "@/components/ai-elements/message";
import { StateNotice } from "@/components/ui/state-surface";

interface ArtifactTextViewerProps {
  content: string;
  emptyDescription?: string;
  emptyTitle?: string;
  isStreaming?: boolean;
}

const SIMULATED_LOGS = [
  "正在初始化课时生成引擎...",
  "分析输入的课程主题与教学要求...",
  "匹配《体育与健康课程标准(2022年版)》要求...",
  "提取核心教学目标：运动能力、健康行为、体育品德...",
  "构建学情分析框架与教材重难点...",
  "设计准备部分：热身活动与专项激趣环节...",
  "编排基本部分：技术学练与体能补偿模块...",
  "规划结束部分：恢复放松与课堂小结...",
  "计算预计运动负荷与器材场地配置...",
  "制定多维评价量表（一至三颗星等级）...",
  "编译教学方案为结构化数据模型...",
  "等待服务端封装结构化首包...",
];

function LessonGenerationSimulator() {
  const [logs, setLogs] = useState<string[]>([]);
  
  useEffect(() => {
    let index = 0;
    setLogs([SIMULATED_LOGS[0]]);
    index++;
    
    const interval = setInterval(() => {
      if (index < SIMULATED_LOGS.length) {
        setLogs((prev) => [...prev, SIMULATED_LOGS[index]]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-full min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border border-brand/20 bg-[#0C1015] font-mono shadow-[0_0_40px_rgba(0,217,146,0.08)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 bg-[#121820] px-4 py-3">
        <Cpu className="size-4 text-brand/80" />
        <span className="text-xs font-semibold uppercase tracking-widest text-brand/70">Lesson Protocol Runtime</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/30">Streaming</span>
          <Loader2 className="size-3.5 animate-spin text-brand" />
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5 text-[13px] leading-relaxed">
        {logs.map((log, i) => (
          <div key={i} className="flex animate-in items-start gap-3 fade-in slide-in-from-bottom-2 duration-500 fill-mode-forwards">
            <span className="shrink-0 select-none text-brand/40">{`[${String((i * 1.5 + 0.1).toFixed(1)).padStart(4, "0")}s]`}</span>
            <span className="text-brand/90">{log}</span>
          </div>
        ))}
        {logs.length < SIMULATED_LOGS.length ? (
          <div className="flex items-center gap-3 pt-1">
            <span className="shrink-0 select-none text-brand/40 opacity-0">[00.0s]</span>
            <span className="animate-pulse text-brand/60">...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ArtifactTextViewer({
  content,
  emptyDescription,
  emptyTitle,
  isStreaming = false,
}: ArtifactTextViewerProps) {
  const normalizedContent = content.trim();
  const shouldShowSimulator = isStreaming && !normalizedContent;

  const resolvedEmptyTitle = emptyTitle ?? (isStreaming ? "等待结构化首包" : "等待课时计划生成");
  const resolvedEmptyDescription =
    emptyDescription ??
    (isStreaming
      ? "请求已进入模型流。收到首段结构化内容后，这里会直接追加显示，不再切换到生成动画。"
      : "请输入课程主题，系统会先生成可审阅的结构化课时计划；确认课时计划无误后，再生成互动大屏。");

  return (
    <AutoScrollArea
      className="h-full w-full bg-card text-foreground"
      contentClassName={shouldShowSimulator ? "p-0 h-full" : "p-8"}
      scrollClassName="overflow-y-auto"
    >
      <div className={`competition-lesson-preview mx-auto ${shouldShowSimulator ? "h-full w-full p-4" : "max-w-4xl leading-relaxed"}`}>
        {normalizedContent ? (
          <MessageResponse>{normalizedContent}</MessageResponse>
        ) : shouldShowSimulator ? (
          <LessonGenerationSimulator />
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
