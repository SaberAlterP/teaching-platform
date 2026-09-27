import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "教学实训平台",
  description: "模块化的课程与实训管理平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
