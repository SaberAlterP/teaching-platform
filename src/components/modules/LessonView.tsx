"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { MODULE_LABELS, type HtmlData, type MediaData, type ModuleType, type QuizData, type RichTextData } from "@/lib/modules";
import { markComplete, reportHtmlScore, submitQuiz, type QuizResult } from "@/app/learn/actions";
import { MediaView } from "./MediaView";
import { QuizView } from "./QuizView";
import { HtmlFrame } from "./HtmlFrame";
import { Celebration, cheerForScore, type Cheer } from "./Celebration";
import { EmptyState } from "@/components/EmptyState";
import { splitTitle } from "@/lib/sections";

export type ViewModule = {
  id: string;
  type: ModuleType;
  title: string;
  data: Record<string, unknown>;
  packageUrl?: string; // HTML 模块
};

// 学生上课页面（老师预览也用它）
export function LessonView({
  title,
  summary,
  courseTitle,
  modules,
  completed: initialCompleted,
  results,
  htmlScores,
  preview,
  backHref,
}: {
  title: string;
  summary: string;
  courseTitle?: string;
  modules: ViewModule[];
  completed: string[];
  results: Record<string, QuizResult>;
  htmlScores: Record<string, { score: number; maxScore: number }>;
  preview?: boolean;
  backHref?: string;
}) {
  const [completed, setCompleted] = useState(new Set(initialCompleted));
  const [scores, setScores] = useState(htmlScores);
  const [active, setActive] = useState(modules[0]?.id);
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const cheerSeq = useRef(0);
  const cheerUp = (c: (id: number) => Cheer) => setCheer(c(++cheerSeq.current));
  const closeCheer = useCallback(() => setCheer(null), []);
  const done = (id: string) => {
    if (completed.has(id)) return;
    setCompleted((s) => new Set(s).add(id));
    if (completed.size + 1 === modules.length) setTimeout(() => cheerUp((n) => ({ id: n, icon: "🎉", title: "本课全部完成！", sub: "获得「完成」徽章" })), 600);
    if (!preview) markComplete(id).catch(() => {});
  };

  const pct = modules.length ? Math.round((completed.size / modules.length) * 100) : 0;

  const activeIndex = Math.max(0, modules.findIndex((m) => m.id === active));
  const { no: lessonNo, name } = splitTitle(title);

  return (
    <div className="lesson-full mx-auto max-w-[1800px]">
      <header className="relative mb-4 overflow-hidden rounded-2xl bg-linear-to-br from-brand-500 to-indigo-500 p-5 text-white shadow-sm sm:p-7">
        <span className="pointer-events-none absolute -right-3 -bottom-10 text-[9rem] leading-none font-black text-white/10 select-none" aria-hidden>{lessonNo || name.slice(0, 1)}</span>
        <div className="relative flex flex-wrap items-end gap-x-8 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
              {courseTitle && <span>{courseTitle}</span>}
              {lessonNo && <span className="rounded-md bg-white/20 px-2 py-0.5 font-medium">第 {lessonNo} 课</span>}
            </div>
            <h1 className="mt-1.5 text-2xl font-bold sm:text-3xl">{name}</h1>
            {summary && <p className="mt-1.5 text-white/85">{summary}</p>}
          </div>
          {modules.length > 0 && (
            <div className="w-full shrink-0 sm:w-56">
              <div className="mb-1 flex justify-between text-sm text-white/85">
                <span>已完成 {completed.size}/{modules.length} 个环节</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      </header>

      {modules.length > 0 && (
        <ProgressBar
          modules={modules}
          completed={completed}
          active={active}
          activeIndex={activeIndex}
          pct={pct}
        />
      )}

      <div className="mt-4 space-y-5">
        {modules.map((m, i) => (
          <Section key={m.id} m={m} onVisible={() => setActive(m.id)} onSeen={() => (m.type === "RICHTEXT" || m.type === "MEDIA" || (m.type === "HTML" && !(m.data as unknown as HtmlData).scored)) && done(m.id)}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="badge bg-brand-50 text-brand-700">{i + 1} · {MODULE_LABELS[m.type]}</span>
              {m.title && <h2 className="text-lg font-bold">{m.title}</h2>}
              {completed.has(m.id) && <span className="text-sm text-emerald-500">✓ 已完成</span>}
            </div>
            {m.type === "RICHTEXT" && <Markdown className="max-w-5xl">{(m.data as unknown as RichTextData).markdown}</Markdown>}
            {m.type === "MEDIA" && <MediaView data={m.data as unknown as MediaData} />}
            {m.type === "QUIZ" && (
              <QuizView
                quiz={m.data as unknown as QuizData}
                initial={results[m.id] ?? null}
                preview={preview}
                onSubmit={async (a) => {
                  const r = await submitQuiz(m.id, a);
                  if (!r.error) {
                    done(m.id);
                    if (!r.needsGrading && r.maxScore > 0) cheerUp((n) => cheerForScore(r.score, r.maxScore, m.title || "习题", n));
                  }
                  return r;
                }}
              />
            )}
            {m.type === "HTML" && (
              <HtmlModule
                m={m}
                best={scores[m.id]}
                onScore={(s) => {
                  const d = m.data as unknown as HtmlData;
                  const max = d.maxScore ?? 100;
                  const v = Math.max(0, Math.min(max, s));
                  setScores((prev) => ({ ...prev, [m.id]: { score: Math.max(prev[m.id]?.score ?? 0, v), maxScore: max } }));
                  if (d.scored) cheerUp((n) => cheerForScore(v, max, m.title || "互动练习", n));
                }}
                onDone={() => done(m.id)}
                preview={preview}
              />
            )}
          </Section>
        ))}

        {modules.length === 0 && <EmptyState title="这节课还没有内容" hint="老师添加内容后会显示在这里" />}
        {modules.length > 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-slate-500">
            {pct === 100 ? <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 font-medium text-emerald-700">🏅 本课内容已全部完成</span> : `— 本课结束，已完成 ${completed.size}/${modules.length} 个环节 —`}
            {backHref && <a href={backHref} className="btn-outline">返回课程列表</a>}
          </div>
        )}
      </div>
      <Celebration cheer={cheer} onClose={closeCheer} />
    </div>
  );
}

// 顶部细进度栏：平时只占一行，点"目录"展开环节列表
function ProgressBar({
  modules, completed, active, activeIndex, pct,
}: {
  modules: ViewModule[];
  completed: Set<string>;
  active?: string;
  activeIndex: number;
  pct: number;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = modules[activeIndex];

  return (
    <div ref={box} className="sticky top-14 z-20 -mx-4 border-b border-slate-200 px-4 backdrop-blur" style={{ background: "color-mix(in srgb, var(--tp-bg, #f5f7fb) 90%, transparent)" }}>
      <div className="flex h-11 items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`btn-outline shrink-0 px-3 py-1 ${open ? "border-brand-500 text-brand-700" : ""}`}
        >
          ☰ 目录
        </button>
        <span className="min-w-0 truncate text-slate-600">
          <span className="text-slate-400">第 {activeIndex + 1}/{modules.length} 个环节 · </span>
          {cur?.title || (cur && MODULE_LABELS[cur.type])}
        </span>
        <span className="ml-auto hidden shrink-0 text-slate-500 sm:inline">已完成 {completed.size}/{modules.length}</span>
        <div className="hidden h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-slate-200 sm:block">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="ml-auto shrink-0 text-slate-500 sm:hidden">{pct}%</span>
      </div>
      {open && (
        <nav className="card absolute top-full left-4 mt-1 max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-auto p-2 text-sm shadow-lg">
          {modules.map((m, i) => (
            <a
              key={m.id}
              href={`#m-${m.id}`}
              onClick={() => setOpen(false)}
              className={`flex items-start gap-2 rounded-md px-2 py-2 leading-5 ${active === m.id ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${completed.has(m.id) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                {completed.has(m.id) ? "✓" : i + 1}
              </span>
              <span>
                {m.title || MODULE_LABELS[m.type]}
                <span className="ml-1.5 text-xs text-slate-400">{MODULE_LABELS[m.type]}</span>
              </span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

function Section({ m, children, onVisible, onSeen }: { m: ViewModule; children: React.ReactNode; onVisible: () => void; onSeen: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const cbs = useRef({ onVisible, onSeen });
  cbs.current = { onVisible, onSeen };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          cbs.current.onVisible();
          // 停留 3 秒视为已学习
          timer = setTimeout(() => cbs.current.onSeen(), 3000);
        } else if (timer) clearTimeout(timer);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, []);
  return (
    <section ref={ref} id={`m-${m.id}`} className={`card scroll-mt-28 ${m.type === "HTML" ? "p-3 sm:p-4" : "p-6"}`}>
      {children}
    </section>
  );
}

function HtmlModule({
  m, best, onScore, onDone, preview,
}: {
  m: ViewModule;
  best?: { score: number; maxScore: number };
  onScore: (s: number) => void;
  onDone: () => void;
  preview?: boolean;
}) {
  const d = m.data as unknown as HtmlData;
  const [toast, setToast] = useState("");
  if (!m.packageUrl) return <div className="rounded-lg bg-slate-100 p-8 text-center text-slate-400">内容未上传</div>;
  return (
    <div className="space-y-2">
      {preview && (
        <div className="text-right text-sm">
          <a href={`/api/packages/${d.assetId}/download`} className="text-brand-700 hover:underline" download>下载 HTML 包</a>
        </div>
      )}
      {(d.note || d.scored) && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          {d.note && <span>{d.note}</span>}
          {d.scored && (
            <span className="badge ml-auto bg-brand-50 text-brand-700">
              {best ? `最高成绩 ${best.score} / ${best.maxScore}` : `计分项 · 满分 ${d.maxScore ?? 100}`}
            </span>
          )}
        </div>
      )}
      <HtmlFrame
        src={m.packageUrl}
        height={d.height}
        onMessage={(msg) => {
          if (msg.type === "tp:complete") { onDone(); return; }
          onDone();
          if (!d.scored) return;
          onScore(msg.score);
          setToast(`成绩已记录：${msg.score}`);
          setTimeout(() => setToast(""), 2500);
          if (!preview) reportHtmlScore(m.id, msg.score, msg.detail).catch(() => {});
        }}
      />
      {toast && <div className="text-sm text-emerald-600">{toast}</div>}
    </div>
  );
}
