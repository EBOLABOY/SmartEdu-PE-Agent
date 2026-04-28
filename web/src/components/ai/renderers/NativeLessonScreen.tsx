"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pause,
  Play,
  ShieldAlert,
  Target,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { LessonSupportVisualizer } from "@/components/ai/renderers/TacticalBoardVisualizer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LessonScreenSectionPlan, LessonScreenSupportModule } from "@/lib/lesson-authoring-contract";

export type NativeLessonScreenSlide = Omit<LessonScreenSectionPlan, "durationSeconds"> & {
  durationSeconds?: number;
  actionSteps?: string[];
  safety?: string;
};

type NormalizedLessonScreenSlide = {
  title: string;
  durationSeconds: number;
  supportModule: LessonScreenSupportModule;
  objective: string;
  actionSteps: string[];
  safetyCue: string;
  evaluationCue: string;
  visualIntent?: string;
};

type NativeLessonScreenProps = {
  slides?: readonly NativeLessonScreenSlide[];
  title?: string;
};

const DEFAULT_DURATION_SECONDS = 180;
const MODULE_LABELS: Record<LessonScreenSupportModule, string> = {
  tacticalBoard: "战术板",
  scoreboard: "计分板",
  rotation: "轮换图",
  formation: "队形图",
};

function positiveDuration(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_DURATION_SECONDS;
  }

  return Math.max(30, Math.round(value));
}

function compactText(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeSlide(slide: NativeLessonScreenSlide): NormalizedLessonScreenSlide {
  const actionSteps = (slide.studentActions?.length ? slide.studentActions : slide.actionSteps ?? [])
    .map(compactText)
    .filter(Boolean)
    .slice(0, 3);

  return {
    title: compactText(slide.title) || "课堂环节",
    durationSeconds: positiveDuration(slide.durationSeconds),
    supportModule: slide.supportModule,
    objective: compactText(slide.objective) || "看清任务、路线、规则和完成标准。",
    actionSteps:
      actionSteps.length > 0
        ? actionSteps
        : ["看清本环节任务", "按小组或队形完成练习", "根据教师反馈调整动作"],
    safetyCue: compactText(slide.safetyCue) || compactText(slide.safety) || "保持安全距离，听口令开始与停止。",
    evaluationCue: compactText(slide.evaluationCue) || "观察动作质量、参与状态和合作表现。",
    visualIntent: compactText(slide.visualIntent) || undefined,
  };
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const restSeconds = (safeSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${restSeconds}`;
}

export default function NativeLessonScreen({
  slides = [],
  title = "课堂学习辅助大屏",
}: NativeLessonScreenProps) {
  const normalizedSlides = useMemo(() => slides.map(normalizeSlide), [slides]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(() => normalizedSlides[0]?.durationSeconds ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const slideCount = normalizedSlides.length;
  const safeCurrentIndex = slideCount ? Math.min(currentIndex, slideCount - 1) : 0;
  const currentSlide = normalizedSlides[safeCurrentIndex];
  const progressRatio = slideCount > 1 ? safeCurrentIndex / (slideCount - 1) : slideCount === 1 ? 1 : 0;

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    if (timeLeft <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTimeLeft((value) => Math.max(0, value - 1));

      if (timeLeft <= 1) {
        setIsPlaying(false);
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isPlaying, timeLeft]);

  const goToSlide = (nextIndex: number) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), Math.max(slideCount - 1, 0));

    setCurrentIndex(boundedIndex);
    setTimeLeft(normalizedSlides[boundedIndex]?.durationSeconds ?? 0);
    setIsPlaying(false);
  };

  if (!currentSlide) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-[oklch(0.11_0.025_165)] p-8 text-emerald-50">
        <div className="max-w-md rounded-[2rem] border border-emerald-100/15 bg-[oklch(0.16_0.025_165)] p-8 text-center">
          <MonitorFallbackIcon />
          <h2 className="mt-5 text-2xl font-black">暂无大屏数据</h2>
          <p className="mt-3 text-sm leading-6 text-emerald-100/70">
            当前教案还没有可渲染的结构化课堂环节。先生成并校验教案，再预览原生大屏。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[560px] w-full overflow-hidden bg-[oklch(0.105_0.028_165)] text-emerald-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(16,185,129,0.24),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(190,242,100,0.12),transparent_30%),linear-gradient(140deg,rgba(6,78,59,0.16),transparent_42%)]" />
      <div className="absolute left-0 top-0 h-1 w-full bg-emerald-950">
        <motion.div
          animate={{ scaleX: progressRatio }}
          className="h-full origin-left bg-brand shadow-[0_0_24px_rgba(0,217,146,0.65)]"
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          className="relative z-10 flex h-full flex-col p-4 pb-24 md:p-8 md:pb-28 xl:p-10 xl:pb-28"
          exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
          initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
          key={safeCurrentIndex}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="mb-5 flex shrink-0 flex-col gap-5 xl:mb-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-emerald-100" variant="outline">
                  环节 {safeCurrentIndex + 1} / {slideCount}
                </Badge>
                <Badge className="border-lime-300/25 bg-lime-300/10 px-3 py-1 text-lime-100" variant="outline">
                  {MODULE_LABELS[currentSlide.supportModule]}
                </Badge>
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-100/55">{title}</p>
              <h1 className="mt-2 max-w-5xl text-4xl font-black leading-[1.05] tracking-tight text-emerald-50 md:text-5xl xl:text-6xl">
                {currentSlide.title}
              </h1>
            </div>

            <div className="flex shrink-0 items-end justify-between gap-5 xl:block xl:text-right">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-100/60 xl:justify-end">
                  <Clock3 className="size-4" />
                  本环节剩余
                </p>
                <div className="mt-1 text-6xl font-black tabular-nums tracking-tighter text-brand drop-shadow-[0_0_18px_rgba(0,217,146,0.34)] md:text-7xl xl:text-8xl">
                  {formatTime(timeLeft)}
                </div>
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-5">
            <Card className="gap-0 rounded-[2rem] border-emerald-100/15 bg-[oklch(0.16_0.028_165)]/95 p-5 text-emerald-50 shadow-[0_20px_80px_-65px_rgba(0,217,146,0.7)] xl:col-span-5 xl:p-7">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-foreground">
                  <CheckCircle2 className="size-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">学生三步行动</h2>
                  <p className="text-sm text-emerald-100/60">看屏即可执行，不靠临场猜测。</p>
                </div>
              </div>

              <div className="mb-5 rounded-[1.5rem] border border-emerald-100/10 bg-emerald-300/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-lime-200">
                  <Target className="size-4" />
                  本环节目标
                </div>
                <p className="text-lg font-semibold leading-7 text-emerald-50">{currentSlide.objective}</p>
              </div>

              <ol className="space-y-3">
                {currentSlide.actionSteps.map((step, index) => (
                  <li
                    className="flex items-center gap-4 rounded-[1.35rem] border border-emerald-100/10 bg-[oklch(0.13_0.024_165)] p-4"
                    key={`${step}-${index}`}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-lime-300 text-xl font-black text-lime-950">
                      {index + 1}
                    </span>
                    <span className="text-xl font-bold leading-7 text-emerald-50">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-5 rounded-[1.35rem] border border-emerald-100/10 bg-[oklch(0.13_0.024_165)] p-4">
                <p className="text-sm font-bold text-emerald-100/55">评价观察</p>
                <p className="mt-1 text-base font-semibold leading-6 text-emerald-50">{currentSlide.evaluationCue}</p>
              </div>
            </Card>

            <Card className="min-h-[320px] gap-0 overflow-hidden rounded-[2rem] border-emerald-100/15 bg-transparent p-0 text-emerald-50 shadow-[0_20px_80px_-65px_rgba(0,217,146,0.7)] xl:col-span-7">
              <LessonSupportVisualizer
                intent={currentSlide.visualIntent}
                module={currentSlide.supportModule}
                title={currentSlide.title}
              />
            </Card>

            <Card className="gap-0 rounded-[2rem] border-amber-200/25 bg-amber-300/10 p-4 text-amber-50 xl:col-span-12 xl:p-5">
              <div className="flex items-center gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-300 text-amber-950">
                  <ShieldAlert className="size-7" />
                </div>
                <p className="text-xl font-bold leading-8 md:text-2xl">
                  <span className="text-amber-200">安全提醒：</span>
                  {currentSlide.safetyCue}
                </p>
              </div>
            </Card>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-100/15 bg-[oklch(0.15_0.026_165)] px-2 py-2 shadow-[0_24px_90px_-50px_rgba(0,0,0,0.8)] md:bottom-7">
        <Button
          aria-label="上一环节"
          className="size-11 rounded-full border-emerald-100/10 bg-transparent text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-35"
          disabled={safeCurrentIndex <= 0}
          onClick={() => goToSlide(safeCurrentIndex - 1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="size-6" />
        </Button>
        <Button
          className="h-11 rounded-full px-6 text-base font-black shadow-[0_0_28px_rgba(0,217,146,0.22)] md:px-8"
          onClick={() => setIsPlaying((value) => !value)}
          type="button"
          variant="brand"
        >
          {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
          {isPlaying ? "暂停" : "开始本环节"}
        </Button>
        <Button
          aria-label="下一环节"
          className="size-11 rounded-full border-emerald-100/10 bg-transparent text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-35"
          disabled={safeCurrentIndex >= slideCount - 1}
          onClick={() => goToSlide(safeCurrentIndex + 1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRight className="size-6" />
        </Button>
      </div>
    </div>
  );
}

function MonitorFallbackIcon() {
  return (
    <div className="mx-auto flex size-14 items-center justify-center rounded-[1.25rem] border border-emerald-100/15 bg-emerald-300/10 text-brand">
      <Target className="size-7" />
    </div>
  );
}
