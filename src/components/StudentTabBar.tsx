"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 手机上的底部导航（电脑上不显示，用顶部导航）
export function StudentTabBar() {
  const path = usePathname();
  const tabs = [
    { href: "/learn", label: "我的课程", icon: "📚", active: path !== "/learn/grades" },
    { href: "/learn/grades", label: "我的成绩", icon: "🏅", active: path === "/learn/grades" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} prefetch={false} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${t.active ? "text-brand-600" : "text-slate-500"}`}>
          <span className="text-lg leading-none" aria-hidden>{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
