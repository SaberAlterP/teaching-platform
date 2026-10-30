"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { groupBySection, splitTitle } from "@/lib/sections";

export type TocLesson = { id: string; title: string; section: string; href: string; status?: string };

const KEY = "tp-toc-open";

// 课时侧边目录：按模块分组、可折叠，当前课时高亮；整个目录可以收起（电脑上记住选择，手机默认收起）
export function LessonShell({
  lessons,
  currentId,
  children,
  full = true,
}: {
  lessons: TocLesson[];
  currentId: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (window.innerWidth < 1024) return;
    try {
      setOpen(localStorage.getItem(KEY) !== "0");
    } catch {
      setOpen(true);
    }
  }, []);
  function toggle(v: boolean) {
    setOpen(v);
    try {
      if (window.innerWidth >= 1024) localStorage.setItem(KEY, v ? "1" : "0");
    } catch {}
  }
  if (lessons.length < 2) return <>{children}</>;
  return (
    <div className={`${full ? "lesson-full mx-auto max-w-[1800px] " : ""}lg:flex lg:items-start lg:gap-5`}>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => toggle(false)} aria-hidden />}
      {open ? (
        <aside
          className="fixed inset-y-0 left-0 z-40 flex w-[min(20rem,85vw)] flex-col bg-white p-3 shadow-xl lg:sticky lg:top-20 lg:z-auto lg:max-h-[calc(100dvh-6rem)] lg:w-72 lg:shrink-0 lg:rounded-xl lg:border lg:border-slate-200 lg:shadow-sm"
          aria-label="课时目录"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-slate-700">课时目录</span>
            <button className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={() => toggle(false)} title="收起目录">
              ✕ 收起
            </button>
          </div>
          <TocList lessons={lessons} currentId={currentId} onNavigate={() => window.innerWidth < 1024 && toggle(false)} />
        </aside>
      ) : (
        <button
          onClick={() => toggle(true)}
          className="card fixed bottom-20 left-3 z-20 px-3 py-2 text-sm font-medium text-slate-600 shadow-md hover:border-brand-500 sm:bottom-6 lg:sticky lg:top-20 lg:bottom-auto lg:left-auto lg:z-auto lg:mb-0 lg:w-auto lg:shrink-0 lg:shadow-sm"
          title="展开课时目录"
        >
          ☰ 目录
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TocList({ lessons, currentId, onNavigate }: { lessons: TocLesson[]; currentId: string; onNavigate: () => void }) {
  const groups = groupBySection(lessons);
  const currentGroup = groups.findIndex((g) => g.items.some((x) => x.item.id === currentId));
  const [closed, setClosed] = useState<Set<number>>(
    () => new Set(groups.map((_, i) => i).filter((i) => i !== currentGroup && groups.length > 1)),
  );
  const flip = (i: number) =>
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
      {groups.map((g, gi) => {
        const folded = closed.has(gi);
        return (
          <div key={gi}>
            {g.section ? (
              <button onClick={() => flip(gi)} className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50">
                <span className={`mt-0.5 shrink-0 transition-transform ${folded ? "" : "rotate-90"}`}>▸</span>
                <span className="min-w-0 flex-1">{g.section}</span>
                <span className="shrink-0 font-normal text-slate-400">{g.items.length}</span>
              </button>
            ) : null}
            {(!g.section || !folded) && (
              <ul className="space-y-0.5">
                {g.items.map(({ item }) => {
                  const { no, name } = splitTitle(item.title);
                  const cur = item.id === currentId;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={cur ? "page" : undefined}
                        className={`flex items-baseline gap-2 rounded-lg py-1.5 pr-2 text-sm transition ${g.section ? "pl-5" : "pl-2"} ${cur ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        {no && <span className="shrink-0 text-xs text-slate-400">{no}</span>}
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        {item.status && item.status !== "OPEN" && <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{item.status === "SCHEDULED" ? "定时" : "草稿"}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
