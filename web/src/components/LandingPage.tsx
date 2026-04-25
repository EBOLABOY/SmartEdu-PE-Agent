"use client";

import { UserCircle } from "lucide-react";
import { motion } from "motion/react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";

interface LandingPageProps {
  onStart: (query: string) => void;
}

function LandingPrompt({ isLaunching, onLaunch }: { isLaunching: boolean; onLaunch: (query: string) => void }) {
  const [value, setValue] = useState("");
  const normalizedValue = value.trim();

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-[1.5rem] border border-border/70 bg-background/95 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-border/40 transition-all focus-within:border-brand/45 focus-within:shadow-[0_14px_36px_rgba(15,23,42,0.08)] focus-within:ring-2 focus-within:ring-brand/10 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        onLaunch(normalizedValue);
      }}
    >
      <input
        aria-label="课程主题"
        className="h-12 min-w-0 flex-1 rounded-[1.1rem] bg-transparent px-4 text-base text-foreground outline-none placeholder:text-muted-foreground/65 disabled:cursor-not-allowed disabled:opacity-60 md:text-lg"
        disabled={isLaunching}
        onChange={(event) => setValue(event.target.value)}
        placeholder="输入课程主题、年级、人数和场地"
        type="text"
        value={value}
      />
      <Button
        className="h-11 w-full shrink-0 rounded-[1rem] px-5 text-sm font-bold shadow-none sm:w-auto"
        disabled={!normalizedValue || isLaunching}
        type="submit"
        variant="brand"
      >
        生成教案
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
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.10),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(245,158,11,0.10),transparent_28%)]" />

      <motion.nav
        animate={isLaunching ? { opacity: 0, y: -12 } : { opacity: 1, y: 0 }}
        className="relative z-10 flex items-center justify-between px-5 py-5 md:px-8"
        transition={{ duration: 0.24 }}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground shadow-sm">
            动
          </div>
          <div>
            <div className="text-lg font-black tracking-tight">动屏智创</div>
            <div className="hidden text-xs text-muted-foreground sm:block">体育教案与互动大屏智能工作台</div>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" type="button">
          <UserCircle aria-hidden size={20} strokeWidth={2} />
        </Button>
      </motion.nav>

      <motion.main
        animate={isLaunching ? { opacity: 0, y: -12, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-5 pb-16 pt-8 md:px-8"
        transition={{ duration: 0.28, ease: [0.2, 0.85, 0.2, 1] }}
      >
        <section className="space-y-8">
          <div className="space-y-5">
            <p className="text-sm font-semibold text-brand">体育课教案与大屏自动生成</p>
            <h1 className="max-w-3xl text-4xl font-black tracking-[-0.035em] text-foreground md:text-6xl">
              输入体育课主题，生成教案和互动大屏。
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              AI 先生成可审阅教案；确认后，再生成适合课堂投屏的大屏。
            </p>
          </div>

          <LandingPrompt isLaunching={isLaunching} onLaunch={launchWorkspace} />

          <p className="text-sm text-muted-foreground">
            安全提醒会随教案一起生成；实际教学前，请结合场地、器材和学生情况确认。
          </p>
        </section>
      </motion.main>
    </div>
  );
}
