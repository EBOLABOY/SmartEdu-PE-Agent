import Link from "next/link";
import type { ReactNode } from "react";

import BrandLogo from "@/components/BrandLogo";
import AuthNavActions from "@/components/layout/AuthNavActions";
import { BRAND_TAGLINE } from "@/lib/brand";

interface AuthPageShellProps {
  children: ReactNode;
  description: string;
  title: string;
}

export default function AuthPageShell({ children, description, title }: AuthPageShellProps) {
  return (
    <main className="h-screen w-screen overflow-y-auto bg-background text-foreground">
      <div className="min-h-full bg-[radial-gradient(circle_at_16%_12%,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_86%_0%,rgba(245,158,11,0.12),transparent_28%)] px-5 py-6 md:px-8">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <Link aria-label="返回首页" href="/">
            <BrandLogo className="h-11 w-auto" priority variant="horizontal" />
          </Link>
          <AuthNavActions accountLabel="后台" registerVariant="outline" />
        </nav>

        <section className="mx-auto grid w-full max-w-6xl gap-8 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.75fr)] lg:items-start lg:py-16">
          <div className="space-y-6">
            <p className="text-sm font-semibold text-brand">{BRAND_TAGLINE}</p>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-black tracking-[-0.035em] md:text-6xl">
                {title}
              </h1>
              <p className="max-w-xl text-base leading-8 text-muted-foreground md:text-lg">
                {description}
              </p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm backdrop-blur">
              <p className="font-medium text-foreground">资料会自动参与教案生成</p>
              <p className="mt-2">
                保存教师姓名、学校名称、任教年级和水平学段后，正式教案模板会自动填入“授课教师”和“水平·年级”。
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-xl shadow-slate-900/8 md:p-6">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
