import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luminous - Pro Workspace",
  description: "AI PE Agent Workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="light h-full w-full">
      <body className="flex h-screen w-screen min-w-0 overflow-hidden text-on-background font-body-md text-body-md bg-background">
        {children}
      </body>
    </html>
  );
}
