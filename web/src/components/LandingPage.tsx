"use client";

import { ArrowRight, CheckCircle2, MonitorPlay, ShieldCheck, Timer } from "lucide-react";
import { motion } from "motion/react";
import React, { useState } from "react";

import BrandLogo from "@/components/BrandLogo";
import AuthNavActions from "@/components/layout/AuthNavActions";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { BRAND_TAGLINE } from "@/lib/brand";

interface LandingPageProps {
  onStart: (query: string) => void;
}

const COMMAND_STEPS = [
  {
    icon: CheckCircle2,
    label: "结构化教案",
    text: "先产出可审阅的目标、流程、组织和评价。",
  },
  {
    icon: ShieldCheck,
    label: "安全校验",
    text: "把人数、器材、路线和风险点放在生成链路里。",
  },
  {
    icon: MonitorPlay,
    label: "互动大屏",
    text: "确认教案后，再生成适合投屏的课堂画面。",
  },
];

function LandingPrompt({
  isLaunching,
  onLaunch,
}: {
  isLaunching: boolean;
  onLaunch: (query: string) => void;
}) {
  const [value, setValue] = useState("");
  const normalizedValue = value.trim();

  return (
    <form
      className="group flex w-full flex-col gap-2 rounded-[1.25rem] border border-brand/25 bg-card/95 p-2 shadow-[0_24px_80px_-52px_rgba(0,217,146,0.65)] ring-1 ring-border/70 transition-colors focus-within:border-brand/55 focus-within:ring-2 focus-within:ring-brand/20 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        onLaunch(normalizedValue);
      }}
    >
      <input
        aria-label="课程主题"
        className="h-12 min-w-0 flex-1 rounded-[0.95rem] bg-transparent px-4 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60 md:text-base"
        disabled={isLaunching}
        onChange={(event) => setValue(event.target.value)}
        placeholder="三年级篮球运球接力，40人，半个篮球场，40分钟"
        type="text"
        value={value}
      />
      <Button
        className="h-12 w-full shrink-0 rounded-[0.95rem] px-5 text-sm font-bold sm:w-auto"
        disabled={!normalizedValue || isLaunching}
        type="submit"
        variant="brand"
      >
        {isLaunching ? "进入工作台" : "生成教案"}
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}

export default function LandingPage({ onStart }: LandingPageProps) {
  const [isLaunching, setIsLaunching] = useState(false);

  const launchWorkspace = (query: string) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery && !isLaunching) {
      setIsLaunching(true);
      window.setTimeout(() => onStart(normalizedQuery), 240);
    }
  };

  return (
    <div className="relative flex min-h-screen w-screen flex-col overflow-hidden bg-background text-foreground antialiased">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(0,217,146,0.18),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(190,242,100,0.10),transparent_28%),linear-gradient(135deg,rgba(61,58,57,0.24),transparent_42%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(184,179,176,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(184,179,176,0.16)_1px,transparent_1px)] [background-size:64px_64px]"
      />
      <div aria-hidden className="absolute bottom-[-18rem] left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />

      <motion.nav
        animate={isLaunching ? { opacity: 0, y: -12 } : { opacity: 1, y: 0 }}
        className="relative z-10 flex items-center justify-between border-b border-border/70 px-5 py-4 md:px-8"
        transition={{ duration: 0.24 }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-2xl border border-brand/25 bg-card/80 p-1 shadow-[0_0_26px_rgba(0,217,146,0.18)]">
            <BrandLogo className="h-10 w-auto" priority variant="horizontal" />
          </div>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-xs text-muted-foreground">{BRAND_TAGLINE}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AuthNavActions accountLabel="打开账号后台" accountMode="icon" />
        </div>
      </motion.nav>

      <motion.main
        animate={isLaunching ? { opacity: 0, y: -12, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 md:px-8 lg:grid-cols-[minmax(0,1.08fr)_420px]"
        transition={{ duration: 0.28, ease: [0.2, 0.85, 0.2, 1] }}
      >
        <section className="space-y-8">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
              <span className="size-1.5 rounded-full bg-brand shadow-[0_0_14px_rgba(0,217,146,0.8)]" />
              PE Lesson Command
            </div>
            <h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.045em] text-foreground md:text-6xl">
              把体育课生成变成
              <span className="text-brand">可控的课堂指挥台</span>
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              AI 先生成可审阅教案。教师确认安全、路线、器材和课堂节奏后，再生成可投屏的互动大屏。
            </p>
          </div>

          <LandingPrompt isLaunching={isLaunching} onLaunch={launchWorkspace} />

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {["不替教师做最终安全判断", "先教案后大屏", "版本可恢复"].map((item) => (
              <span key={item} className="rounded-full border border-border/70 bg-card/70 px-3 py-1.5">
                {item}
              </span>
            ))}
          </div>
        </section>

        <aside className="rounded-[1.5rem] border border-border/80 bg-card/85 p-5 shadow-[0_20px_70px_-55px_rgba(0,217,146,0.55)] lg:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Live Workflow</p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">生成链路</h2>
            </div>
            <div className="flex size-11 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand">
              <Timer className="size-5" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {COMMAND_STEPS.map((step, index) => {
              const Icon = step.icon;

              return (
                <div key={step.label} className="rounded-2xl border border-border/70 bg-background/55 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">0{index + 1}</span>
                        <h3 className="text-sm font-semibold text-foreground">{step.label}</h3>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.text}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-brand/25 bg-brand/10 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Example Prompt</p>
            <p className="mt-3 font-mono text-xs leading-6 text-foreground">
              三年级篮球运球接力 · 40人 · 20个篮球 · 半场 · 40分钟
            </p>
          </div>
        </aside>
      </motion.main>
    </div>
  );
}
