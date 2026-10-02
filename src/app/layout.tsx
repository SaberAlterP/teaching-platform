import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme } from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "教学实训平台", template: "%s · 教学实训平台" },
  description: "模块化的课程与实训管理平台",
};
export const viewport: Viewport = { themeColor: "#2f6fed", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = (await cookies()).get(THEME_COOKIE)?.value ?? "";
  return (
    <html lang="zh-CN" data-theme={t && isTheme(t) ? t : undefined}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
