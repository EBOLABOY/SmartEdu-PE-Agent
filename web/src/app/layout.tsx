import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: "动屏智创 — AI 体育教案工作台",
  description: "输入课程主题，AI 先生成可审阅教案；确认后自动生成互动大屏。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex h-screen w-screen min-w-0 overflow-hidden font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem
        >
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
