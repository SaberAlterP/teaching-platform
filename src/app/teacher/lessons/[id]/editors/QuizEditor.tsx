"use client";
import { useState } from "react";
import { QUESTION_LABELS, type Question, type QuestionType, type QuizData } from "@/lib/modules";
import { parseQuestions } from "@/lib/quiz-parse";

const newId = () => Math.random().toString(36).slice(2, 10);
const LETTERS = "ABCDEFGHIJ";

export function QuizEditor({ data, onChange }: { data: QuizData; onChange: (d: QuizData) => void }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const total = data.questions.reduce((a, b) => a + (Number(b.points) || 0), 0);

  const setQ = (i: number, q: Question) => onChange({ ...data, questions: data.questions.map((x, j) => (j === i ? q : x)) });
  const removeQ = (i: number) => onChange({ ...data, questions: data.questions.filter((_, j) => j !== i) });
  const moveQ = (i: number, d: number) => {
    const qs = [...data.questions];
    const j = i + d;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    onChange({ ...data, questions: qs });
  };
  const addQ = (type: QuestionType) => {
    const base: Question = { id: newId(), type, prompt: "", points: type === "short" ? 5 : 2 };
    if (type === "single") Object.assign(base, { options: ["", "", "", ""], answer: 0 });
    if (type === "multi") Object.assign(base, { options: ["", "", "", ""], answer: [], points: 3 });
    if (type === "fill") Object.assign(base, { answer: [""] });
    if (type === "short") Object.assign(base, { answer: "" });
    onChange({ ...data, questions: [...data.questions, base] });
  };

  const parsed = pasteOpen && pasteText.trim() ? parseQuestions(pasteText, newId) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={data.allowRetry} onChange={(e) => onChange({ ...data, allowRetry: e.target.checked })} />
          允许重做
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={data.showAnswers} onChange={(e) => onChange({ ...data, showAnswers: e.target.checked })} />
          提交后显示答案和解析
        </label>
        <span className="ml-auto text-slate-500">共 {data.questions.length} 题，{total} 分</span>
      </div>

      {data.questions.map((q, i) => (
        <QuestionEditor
          key={q.id}
          index={i}
          q={q}
          onChange={(nq) => setQ(i, nq)}
          onRemove={() => removeQ(i)}
          onUp={() => moveQ(i, -1)}
          onDown={() => moveQ(i, 1)}
        />
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(QUESTION_LABELS) as QuestionType[]).map((t) => (
          <button key={t} type="button" className="btn-outline" onClick={() => addQ(t)}>+ {QUESTION_LABELS[t]}题</button>
        ))}
        <button type="button" className="btn-ghost" onClick={() => setPasteOpen(!pasteOpen)}>📋 批量粘贴导入</button>
      </div>

      {pasteOpen && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs leading-relaxed text-slate-500">
            每题之间空一行。选项用 A. B. C. 开头，答案写“答案：B”（多选写“答案：AC”）；没有选项的是填空题，
            多个可接受答案用 | 分隔；题干以【简答】开头或没有答案的是简答题。可选：“分值：3”、“解析：……”。
          </p>
          <textarea
            className="input min-h-48 font-mono text-[13px]"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"1. 公路运输最主要的优势是？\nA. 运量大\nB. 门到门、机动灵活\nC. 单位成本最低\nD. 不受天气影响\n答案：B\n解析：公路运输能实现门到门服务。\n\n2. 集装箱标准箱的英文缩写是____。\n答案：TEU\n\n3. 【简答】简述多式联运的优点。\n参考答案：减少中转、全程一票……"}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!parsed.length}
              onClick={() => { onChange({ ...data, questions: [...data.questions, ...parsed] }); setPasteText(""); setPasteOpen(false); }}
            >
              添加识别到的 {parsed.length} 道题
            </button>
            {parsed.length > 0 && (
              <span className="text-xs text-slate-500">
                {parsed.map((q) => QUESTION_LABELS[q.type]).join("、")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionEditor({
  index, q, onChange, onRemove, onUp, onDown,
}: {
  index: number; q: Question; onChange: (q: Question) => void; onRemove: () => void; onUp: () => void; onDown: () => void;
}) {
  const opts = q.options ?? [];
  const setOpt = (i: number, v: string) => onChange({ ...q, options: opts.map((o, j) => (j === i ? v : o)) });
  const removeOpt = (i: number) => {
    const options = opts.filter((_, j) => j !== i);
    let answer = q.answer;
    if (q.type === "single") answer = typeof q.answer === "number" ? (q.answer === i ? 0 : q.answer > i ? q.answer - 1 : q.answer) : 0;
    if (q.type === "multi") answer = ((q.answer as number[]) ?? []).filter((a) => a !== i).map((a) => (a > i ? a - 1 : a));
    onChange({ ...q, options, answer });
  };
  const toggleCorrect = (i: number) => {
    if (q.type === "single") onChange({ ...q, answer: i });
    else {
      const cur = new Set((q.answer as number[]) ?? []);
      if (cur.has(i)) cur.delete(i); else cur.add(i);
      onChange({ ...q, answer: [...cur].sort() });
    }
  };
  const isCorrect = (i: number) => (q.type === "single" ? q.answer === i : ((q.answer as number[]) ?? []).includes(i));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="font-semibold">第 {index + 1} 题</span>
        <span className="badge bg-brand-50 text-brand-700">{QUESTION_LABELS[q.type]}</span>
        <label className="ml-2 flex items-center gap-1 text-slate-500">
          分值
          <input
            type="number"
            min={0}
            step={0.5}
            className="input w-20 py-1"
            value={q.points}
            onChange={(e) => onChange({ ...q, points: Number(e.target.value) })}
          />
        </label>
        <div className="ml-auto flex">
          <button type="button" className="btn-ghost px-2 py-1" onClick={onUp}>↑</button>
          <button type="button" className="btn-ghost px-2 py-1" onClick={onDown}>↓</button>
          <button type="button" className="btn-danger px-2 py-1" onClick={onRemove}>删除</button>
        </div>
      </div>
      <textarea
        className="input mb-3"
        rows={2}
        placeholder={q.type === "fill" ? "题干，用 ____ 表示空" : "题干（支持 Markdown）"}
        value={q.prompt}
        onChange={(e) => onChange({ ...q, prompt: e.target.value })}
      />

      {(q.type === "single" || q.type === "multi") && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-400">点击左侧字母标记正确答案{q.type === "multi" ? "（可多选）" : ""}</p>
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleCorrect(i)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                  isCorrect(i) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-500"
                }`}
              >
                {LETTERS[i]}
              </button>
              <input className="input" value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`选项 ${LETTERS[i]}`} />
              <button type="button" className="btn-ghost px-2" onClick={() => removeOpt(i)} disabled={opts.length <= 2}>✕</button>
            </div>
          ))}
          {opts.length < 10 && (
            <button type="button" className="btn-ghost text-xs" onClick={() => onChange({ ...q, options: [...opts, ""] })}>+ 添加选项</button>
          )}
        </div>
      )}

      {q.type === "fill" && (
        <div>
          <label className="label">可接受的答案（每行一个，任一匹配即得分；忽略大小写和空格）</label>
          <textarea
            className="input"
            rows={2}
            value={((q.answer as string[]) ?? []).join("\n")}
            onChange={(e) => onChange({ ...q, answer: e.target.value.split("\n") })}
          />
        </div>
      )}

      {q.type === "short" && (
        <div>
          <label className="label">参考答案（仅在批改时给老师看）</label>
          <textarea className="input" rows={2} value={String(q.answer ?? "")} onChange={(e) => onChange({ ...q, answer: e.target.value })} />
        </div>
      )}

      <div className="mt-3">
        <label className="label">解析（可选，提交后显示给学生）</label>
        <input className="input" value={q.explanation ?? ""} onChange={(e) => onChange({ ...q, explanation: e.target.value })} />
      </div>
    </div>
  );
}
