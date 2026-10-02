"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { THEMES } from "@/lib/themes";
import { setTheme } from "@/app/account/theme";

export function ThemePicker({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [theme, setLocal] = useState(current);
  const [, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  const pick = (key: string) => {
    setLocal(key);
    // 先立刻换色，再在后台保存
    if (key) document.documentElement.dataset.theme = key;
    else delete document.documentElement.dataset.theme;
    start(() => setTheme(key));
  };

  return (
    <div className="relative" ref={box}>
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)} aria-label="主题" title="更换主题">
        <span aria-hidden>🎨</span><span className="hidden md:inline">主题</span>
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-56 p-3 shadow-lg">
          <div className="mb-2 text-xs font-medium text-slate-500">选择主题</div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.key}
                onClick={() => pick(t.key)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition hover:bg-slate-50 ${theme === t.key ? "border-brand-500 bg-brand-50 text-brand-600" : "border-slate-200 text-slate-600"}`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200" style={{ background: t.swatch[1] }}>
                  <span className="h-4 w-4 rounded-full" style={{ background: t.swatch[0] }} />
                </span>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
