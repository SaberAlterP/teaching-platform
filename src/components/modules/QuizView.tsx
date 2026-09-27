"use client";
import { useState, useTransition } from "react";
import { Markdown } from "@/components/Markdown";
import { gradeQuiz, QUESTION_LABELS, type Question, type QuizData } from "@/lib/modules";
import type { QuizResult } from "@/app/learn/actions";

const LETTERS = "ABCDEFGHIJ";

export function QuizView({
  quiz,
  initial,
  onSubmit,
  preview,
}: {
  quiz: QuizData; // 学生模式下不含答案
  initial: QuizResult | null;
  onSubmit?: (answers: Record<string, unknown>) => Promise<QuizResult>;
  preview?: boolean; // 老师预览：quiz 含答案，在本地判分
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial?.answers ?? {});
  const [result, setResult] = useState<QuizResult | null>(initial);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const locked = !!result;

  const unanswered = quiz.questions.filter((q) => {
    const a = answers[q.id];
    return a === undefined || a === "" || (Array.isArray(a) && !a.length);
  }).length;

  function submit() {
    if (unanswered && !confirm(`还有 ${unanswered} 题没有作答，确定提交吗？`)) return;
    start(async () => {
      setErr("");
      if (preview) {
        const g = gradeQuiz(quiz, answers);
        setResult({
          ...g, attempts: 1, answers,
          reveal: Object.fromEntries(quiz.questions.map((q) => [q.id, { answer: q.answer, explanation: q.explanation }])),
        });
        return;
      }
      const r = await onSubmit!(answers);
      if (r.error) setErr(r.error);
      else setResult(r);
    });
  }

  return (
    <div className="space-y-4">
      {result && (
        <div className={`flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm ${result.needsGrading ? "bg-amber-50" : "bg-emerald-50"}`}>
          <span className="text-lg font-bold">
            {result.score} <span className="text-sm font-normal text-slate-500">/ {result.maxScore} 分</span>
          </span>
          {result.needsGrading && <span className="text-amber-700">简答题等待老师批改，最终分数可能变化</span>}
          {result.attempts > 1 && <span className="text-slate-500">第 {result.attempts} 次作答</span>}
          {quiz.allowRetry && (
            <button className="btn-outline ml-auto" onClick={() => setResult(null)}>重新作答</button>
          )}
        </div>
      )}

      {quiz.questions.map((q, i) => (
        <QuestionView
          key={q.id}
          index={i}
          q={q}
          value={answers[q.id]}
          onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
          locked={locked}
          itemScore={result ? result.itemScores[q.id] : undefined}
          reveal={result?.reveal?.[q.id]}
        />
      ))}

      {!locked && quiz.questions.length > 0 && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={submit} disabled={pending}>{pending ? "提交中…" : "提交答案"}</button>
          <span className="text-sm text-slate-400">
            {unanswered ? `还有 ${unanswered} 题未作答` : "全部已作答"}
            {!quiz.allowRetry && " · 只能提交一次"}
          </span>
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      )}
      {quiz.questions.length === 0 && <p className="text-sm text-slate-400">暂无题目</p>}
    </div>
  );
}

function QuestionView({
  index, q, value, onChange, locked, itemScore, reveal,
}: {
  index: number;
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
  locked: boolean;
  itemScore: number | null | undefined;
  reveal?: { answer: unknown; explanation?: string };
}) {
  const graded = itemScore !== undefined;
  const pending = itemScore === null;
  const full = graded && itemScore === q.points;
  const border = !graded ? "border-slate-200" : pending ? "border-amber-300" : full ? "border-emerald-300" : "border-red-300";

  const isAnswer = (i: number) =>
    reveal && (q.type === "single" ? reveal.answer === i : Array.isArray(reveal.answer) && (reveal.answer as number[]).includes(i));

  return (
    <div className={`rounded-lg border-2 bg-white p-4 ${border}`}>
      <div className="mb-2 flex items-start gap-2">
        <span className="font-semibold text-slate-500">{index + 1}.</span>
        <div className="min-w-0 flex-1"><Markdown>{q.prompt}</Markdown></div>
        <span className="shrink-0 text-xs text-slate-400">
          {QUESTION_LABELS[q.type]} · {q.points} 分
          {graded && (
            <span className={`ml-1 font-semibold ${pending ? "text-amber-600" : full ? "text-emerald-600" : "text-red-600"}`}>
              {pending ? "待批改" : `得 ${itemScore}`}
            </span>
          )}
        </span>
      </div>

      {(q.type === "single" || q.type === "multi") && (
        <div className="space-y-1.5 pl-6">
          {q.options!.map((o, i) => {
            const checked = q.type === "single" ? value === i : Array.isArray(value) && value.includes(i);
            return (
              <label
                key={i}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition ${
                  checked ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                } ${locked ? "cursor-default" : ""} ${isAnswer(i) ? "ring-2 ring-emerald-400" : ""}`}
              >
                <input
                  type={q.type === "single" ? "radio" : "checkbox"}
                  disabled={locked}
                  checked={checked}
                  onChange={() => {
                    if (q.type === "single") onChange(i);
                    else {
                      const cur = new Set(Array.isArray(value) ? (value as number[]) : []);
                      if (cur.has(i)) cur.delete(i); else cur.add(i);
                      onChange([...cur].sort());
                    }
                  }}
                />
                <span className="font-medium text-slate-500">{LETTERS[i]}.</span>
                <span>{o}</span>
                {isAnswer(i) && <span className="ml-auto text-xs text-emerald-600">正确答案</span>}
              </label>
            );
          })}
        </div>
      )}

      {q.type === "fill" && (
        <div className="pl-6">
          <input className="input max-w-md" disabled={locked} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="填写答案" />
          {reveal && Array.isArray(reveal.answer) && (
            <p className="mt-1 text-sm text-emerald-700">参考答案：{(reveal.answer as string[]).filter(Boolean).join(" / ")}</p>
          )}
        </div>
      )}

      {q.type === "short" && (
        <div className="pl-6">
          <textarea className="input" rows={4} disabled={locked} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="写下你的回答" />
        </div>
      )}

      {reveal?.explanation && (
        <div className="mt-3 ml-6 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <span className="font-semibold">解析：</span>{reveal.explanation}
        </div>
      )}
    </div>
  );
}
