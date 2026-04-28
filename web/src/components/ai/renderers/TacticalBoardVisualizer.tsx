"use client";

import { motion } from "motion/react";
import React, { useState } from "react";
import { RotateCw, Trophy, UsersRound } from "lucide-react";

import type { LessonScreenSupportModule } from "@/lib/lesson-authoring-contract";
import { cn } from "@/lib/utils";

type VisualizerProps = {
  title: string;
  intent?: string;
};

const TEAM_COLORS = [
  "bg-rose-400 text-rose-950",
  "bg-sky-300 text-sky-950",
  "bg-amber-300 text-amber-950",
  "bg-emerald-300 text-emerald-950",
] as const;

function CourtFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative flex h-full min-h-[280px] w-full flex-col justify-center overflow-hidden rounded-[2rem] border border-emerald-200/15 bg-[oklch(0.18_0.035_165)] p-4 shadow-[0_22px_80px_-60px_rgba(0,217,146,0.7)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(190,242,100,0.13),transparent_34%),radial-gradient(circle_at_18%_78%,rgba(45,212,191,0.14),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-5 rounded-[1.5rem] border border-emerald-100/10" />
      <div className="relative z-10 mb-4 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/70">
        <span>{label}</span>
        <span>Live Board</span>
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function PlayerDot({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-12 items-center justify-center rounded-full border-4 border-emerald-50/90 text-lg font-black shadow-[0_0_22px_rgba(52,211,153,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TacticalBoardVisualizer({ title, intent }: VisualizerProps) {
  return (
    <CourtFrame label="战术跑位">
      <div className="relative aspect-[16/10] w-full max-w-3xl overflow-hidden rounded-[1.75rem] border-2 border-emerald-100/20 bg-[oklch(0.14_0.03_165)]">
        <div className="absolute inset-5 rounded-[1.35rem] border-2 border-emerald-100/20" />
        <div className="absolute left-1/2 top-5 h-[calc(100%-2.5rem)] w-px bg-emerald-100/20" />
        <div className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-100/20" />
        <div className="absolute left-8 top-1/2 h-40 w-24 -translate-y-1/2 rounded-r-2xl border-2 border-l-0 border-emerald-100/20" />
        <div className="absolute right-8 top-1/2 h-40 w-24 -translate-y-1/2 rounded-l-2xl border-2 border-r-0 border-emerald-100/20" />

        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full text-emerald-200/55"
          preserveAspectRatio="none"
          viewBox="0 0 640 400"
        >
          <path d="M130 302 C210 188 286 166 394 102" fill="none" stroke="currentColor" strokeDasharray="10 12" strokeWidth="4" />
          <path d="M210 108 C318 168 392 216 514 284" fill="none" stroke="currentColor" strokeWidth="4" />
        </svg>

        <motion.div
          animate={{ x: ["0%", "112%", "168%"], y: ["0%", "-52%", "-94%"] }}
          className="absolute bottom-[17%] left-[18%]"
          transition={{ duration: 4.8, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.4 }}
        >
          <PlayerDot className="bg-sky-300 text-sky-950">1</PlayerDot>
        </motion.div>
        <motion.div
          animate={{ x: ["0%", "96%", "190%"], y: ["0%", "42%", "92%"] }}
          className="absolute left-[31%] top-[23%]"
          transition={{ duration: 5.2, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.2 }}
        >
          <PlayerDot className="bg-emerald-300 text-emerald-950">2</PlayerDot>
        </motion.div>
        <PlayerDot className="absolute right-[23%] top-[22%] bg-lime-300 text-lime-950">3</PlayerDot>
        <PlayerDot className="absolute bottom-[21%] right-[20%] bg-orange-300 text-orange-950">防</PlayerDot>
        <motion.div
          animate={{ scale: [1, 1.18, 1], x: [0, 180, 250], y: [0, 84, 126] }}
          className="absolute left-[34%] top-[29%] size-5 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.7)]"
          transition={{ duration: 3.4, ease: "easeInOut", repeat: Infinity }}
        />
      </div>
      <div className="mt-5 max-w-3xl text-center">
        <p className="text-xl font-black tracking-tight text-emerald-50">{title}</p>
        <p className="mt-2 text-sm leading-6 text-emerald-100/70">
          {intent ?? "实线看传球，虚线看移动。先找自己的编号，再按箭头完成跑位。"}
        </p>
      </div>
    </CourtFrame>
  );
}

export function ScoreboardVisualizer({ title, intent }: VisualizerProps) {
  const [scores, setScores] = useState([0, 0, 0, 0]);

  const updateScore = (index: number, delta: number) => {
    setScores((current) =>
      current.map((score, scoreIndex) => (scoreIndex === index ? Math.max(0, score + delta) : score)),
    );
  };

  return (
    <CourtFrame label="分组计分">
      <div className="grid w-full max-w-4xl gap-3 md:grid-cols-4">
        {scores.map((score, index) => (
          <div
            className="rounded-[1.5rem] border border-emerald-100/15 bg-[oklch(0.13_0.025_165)] p-4 text-center"
            key={index}
          >
            <div className={cn("mx-auto flex size-12 items-center justify-center rounded-2xl font-black", TEAM_COLORS[index])}>
              {index + 1}
            </div>
            <p className="mt-3 text-sm font-semibold text-emerald-100/70">第 {index + 1} 组</p>
            <p className="mt-2 text-6xl font-black tabular-nums tracking-tighter text-emerald-50">{score}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-emerald-100/15 px-3 py-2 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                onClick={() => updateScore(index, -1)}
                type="button"
              >
                -1
              </button>
              <button
                className="rounded-xl bg-brand px-3 py-2 text-sm font-black text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                onClick={() => updateScore(index, 1)}
                type="button"
              >
                +1
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 max-w-3xl text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black tracking-tight text-emerald-50">
          <Trophy className="size-6 text-amber-300" />
          {title}
        </p>
        <p className="mt-2 text-sm leading-6 text-emerald-100/70">
          {intent ?? "完成动作加分，犯规或抢道不加分。公平、清楚、即时反馈。"}
        </p>
      </div>
    </CourtFrame>
  );
}

export function RotationVisualizer({ title, intent }: VisualizerProps) {
  const stations = ["起点", "绕桩", "传接", "返回"];

  return (
    <CourtFrame label="轮换路线">
      <div className="relative aspect-[16/10] w-full max-w-3xl rounded-[1.75rem] border-2 border-emerald-100/20 bg-[oklch(0.14_0.03_165)] p-8">
        <div className="absolute inset-8 rounded-[1.25rem] border-2 border-dashed border-emerald-100/20" />
        <motion.div
          animate={{ rotate: 360 }}
          className="absolute inset-14 rounded-[1.1rem] border-4 border-emerald-300/70 border-l-transparent"
          transition={{ duration: 10, ease: "linear", repeat: Infinity }}
        />
        {stations.map((station, index) => {
          const positions = [
            "left-[13%] top-[18%]",
            "right-[13%] top-[18%]",
            "right-[13%] bottom-[18%]",
            "left-[13%] bottom-[18%]",
          ];

          return (
            <div
              className={cn(
                "absolute flex size-24 items-center justify-center rounded-[1.5rem] border border-emerald-100/20 bg-emerald-300 text-center text-lg font-black text-emerald-950 shadow-[0_0_30px_rgba(110,231,183,0.22)]",
                positions[index],
              )}
              key={station}
            >
              {index + 1}
              <span className="absolute top-full mt-2 text-sm font-bold text-emerald-50">{station}</span>
            </div>
          );
        })}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-emerald-100/15 bg-[oklch(0.2_0.04_165)] px-5 py-3 text-sm font-black text-emerald-50">
          <RotateCw className="size-5 text-lime-300" />
          顺时针轮换
        </div>
      </div>
      <div className="mt-5 max-w-3xl text-center">
        <p className="text-xl font-black tracking-tight text-emerald-50">{title}</p>
        <p className="mt-2 text-sm leading-6 text-emerald-100/70">
          {intent ?? "完成本站任务后，听口令沿同一方向换位。只走自己的通道，不逆行。"}
        </p>
      </div>
    </CourtFrame>
  );
}

export function FormationVisualizer({ title, intent }: VisualizerProps) {
  const dots = Array.from({ length: 24 }, (_, index) => index);

  return (
    <CourtFrame label="组织队形">
      <div className="relative grid w-full max-w-3xl grid-cols-6 gap-4 rounded-[1.75rem] border-2 border-emerald-100/20 bg-[oklch(0.14_0.03_165)] p-8">
        {dots.map((dot) => (
          <motion.div
            animate={{ opacity: [0.72, 1, 0.72] }}
            className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-200 text-sm font-black text-emerald-950"
            key={dot}
            transition={{ delay: (dot % 6) * 0.08, duration: 2.6, ease: "easeInOut", repeat: Infinity }}
          >
            {dot % 6 === 0 ? "组" : ""}
          </motion.div>
        ))}
        <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-200/25 bg-amber-300 px-5 py-3 text-sm font-black text-amber-950 shadow-[0_14px_40px_-28px_rgba(251,191,36,0.75)]">
          <UsersRound className="size-5" />
          教师口令区
        </div>
      </div>
      <div className="mt-10 max-w-3xl text-center">
        <p className="text-xl font-black tracking-tight text-emerald-50">{title}</p>
        <p className="mt-2 text-sm leading-6 text-emerald-100/70">
          {intent ?? "先站稳队形，再看边界和间距。听到开始口令后进入练习。"}
        </p>
      </div>
    </CourtFrame>
  );
}

export function LessonSupportVisualizer({
  module,
  title,
  intent,
}: VisualizerProps & {
  module: LessonScreenSupportModule;
}) {
  if (module === "scoreboard") {
    return <ScoreboardVisualizer intent={intent} title={title} />;
  }

  if (module === "rotation") {
    return <RotationVisualizer intent={intent} title={title} />;
  }

  if (module === "tacticalBoard") {
    return <TacticalBoardVisualizer intent={intent} title={title} />;
  }

  return <FormationVisualizer intent={intent} title={title} />;
}
