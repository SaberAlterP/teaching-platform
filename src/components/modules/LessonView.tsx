"use client";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { MODULE_LABELS, type HtmlData, type MediaData, type ModuleType, type QuizData, type RichTextData } from "@/lib/modules";
import { markComplete, reportHtmlScore, submitQuiz, type QuizResult } from "@/app/learn/actions";
import { MediaView } from "./MediaView";
import { QuizView } from "./QuizView";
import { HtmlFrame } from "./HtmlFrame";

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
  modules,
  completed: initialCompleted,
  results,
  htmlScores,
  preview,
  backHref,
}: {
  title: string;
  summary: string;
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
  const done = (id: string) => {
    if (completed.has(id)) return;
    setCompleted((s) => new Set(s).add(id));
    if (!preview) markComplete(id).catch(() => {});
  };

  const pct = modules.length ? Math.round((completed.size / modules.length) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-3">
          <div className="card p-4">
            <div className="mb-2 text-xs text-slate-500">本课进度 {pct}%</div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <nav className="card max-h-[70vh] overflow-auto p-2 text-sm">
            {modules.map((m, i) => (
              <a
                key={m.id}
                href={`#m-${m.id}`}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 leading-5 ${active === m.id ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${completed.has(m.id) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {completed.has(m.id) ? "✓" : i + 1}
                </span>
                <span className="line-clamp-2">{m.title || MODULE_LABELS[m.type]}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        <header>
          <h1 className="text-3xl font-bold">{title}</h1>
          {summary && <p className="mt-2 text-slate-500">{summary}</p>}
        </header>

        {modules.map((m, i) => (
          <Section key={m.id} m={m} onVisible={() => setActive(m.id)} onSeen={() => (m.type === "RICHTEXT" || m.type === "MEDIA" || (m.type === "HTML" && !(m.data as unknown as HtmlData).scored)) && done(m.id)}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="badge bg-brand-50 text-brand-700">{i + 1} · {MODULE_LABELS[m.type]}</span>
              {m.title && <h2 className="text-lg font-bold">{m.title}</h2>}
              {completed.has(m.id) && <span className="text-sm text-emerald-500">✓ 已完成</span>}
            </div>
            {m.type === "RICHTEXT" && <Markdown>{(m.data as unknown as RichTextData).markdown}</Markdown>}
            {m.type === "MEDIA" && <MediaView data={m.data as unknown as MediaData} />}
            {m.type === "QUIZ" && (
              <QuizView
                quiz={m.data as unknown as QuizData}
                initial={results[m.id] ?? null}
                preview={preview}
                onSubmit={async (a) => {
                  const r = await submitQuiz(m.id, a);
                  if (!r.error) done(m.id);
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
                }}
                onDone={() => done(m.id)}
                preview={preview}
              />
            )}
          </Section>
        ))}

        {modules.length === 0 && <div className="card p-10 text-center text-slate-400">这节课还没有内容</div>}
        {modules.length > 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-slate-500">
            {pct === 100 ? "🎉 本课内容已全部完成" : `— 本课结束，已完成 ${completed.size}/${modules.length} 个环节 —`}
            {backHref && <a href={backHref} className="btn-outline">返回课程列表</a>}
          </div>
        )}
      </div>
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
    <section ref={ref} id={`m-${m.id}`} className={`card scroll-mt-20 ${m.type === "HTML" ? "p-3 sm:p-4" : "p-6"}`}>
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
