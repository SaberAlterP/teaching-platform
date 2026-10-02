"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/teacher/assistant", label: "对话" },
  { href: "/teacher/assistant/skills", label: "技能" },
];

export function AssistantTabs({ right }: { right?: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-slate-200">
      <span className="mr-2 font-bold">AI 助手</span>
      {TABS.map((t) => {
        const on = t.href === "/teacher/assistant" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${on ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
          </Link>
        );
      })}
      <div className="ml-auto">{right}</div>
    </div>
  );
}
