import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND_DESCRIPTION, BRAND_FULL_TITLE, BRAND_LOGO_ICON_SRC } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_FULL_TITLE,
  description: BRAND_DESCRIPTION,
  icons: {
    icon: BRAND_LOGO_ICON_SRC,
    apple: BRAND_LOGO_ICON_SRC,
  },
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
