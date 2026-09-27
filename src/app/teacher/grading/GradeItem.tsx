"use client";
import { useState, useTransition } from "react";
import { Markdown } from "@/components/Markdown";
import { gradeItem } from "../actions";

export function GradeItem(p: {
  submissionId: string; questionId: string; lesson: string; module: string; prompt: string;
  reference: string; points: number; answer: string; current: number | null; student: string;
}) {
  const [score, setScore] = useState(p.current ?? "");
  const [saved, setSaved] = useState(p.current !== null);
  const [pending, start] = useTransition();
  const save = (v: number) => start(async () => { await gradeItem(p.submissionId, p.questionId, v); setScore(v); setSaved(true); });

  return (
    <div className={`card p-4 ${saved ? "opacity-70" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-800">{p.student}</span>
        <span>· {p.lesson}{p.module ? ` / ${p.module}` : ""}</span>
        <span className="ml-auto">满分 {p.points}</span>
      </div>
      <div className="mb-2 text-sm"><Markdown>{p.prompt}</Markdown></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap">
          <div className="mb-1 text-xs text-slate-400">学生回答</div>
          {p.answer || <span className="text-slate-400">（空）</span>}
        </div>
        <div className="rounded-lg bg-emerald-50/60 p-3 text-sm whitespace-pre-wrap">
          <div className="mb-1 text-xs text-slate-400">参考答案</div>
          {p.reference || <span className="text-slate-400">（未设置）</span>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">给分：</span>
        {[0, 0.5, 1].map((f) => {
          const v = Math.round(p.points * f * 2) / 2;
          return (
            <button key={f} className="btn-outline px-3 py-1" disabled={pending} onClick={() => save(v)}>
              {f === 0 ? "0" : f === 1 ? `满分 ${v}` : v}
            </button>
          );
        })}
        <input
          type="number" min={0} max={p.points} step={0.5} className="input w-24 py-1"
          value={score} onChange={(e) => { setScore(e.target.value === "" ? "" : Number(e.target.value)); setSaved(false); }}
        />
        <button className="btn-primary py-1" disabled={pending || score === ""} onClick={() => save(Number(score))}>确定</button>
        {saved && <span className="text-sm text-emerald-600">已批改：{score} 分</span>}
      </div>
    </div>
  );
}
