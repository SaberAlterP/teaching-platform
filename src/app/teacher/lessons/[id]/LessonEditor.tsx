"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { MODULE_LABELS, type ModuleType } from "@/lib/modules";
import { StatusBadge } from "@/components/StatusBadge";
import { addModule, deleteModule, duplicateModule, reorderModules, setLessonStatus, updateLesson } from "../../actions";
import { ModuleCard, type EditorModule, type PackageMap } from "./ModuleCard";

type LessonInfo = { id: string; title: string; summary: string; section: string; status: string; openAt: string | null };

const TYPE_ICONS: Record<ModuleType, string> = { RICHTEXT: "📝", MEDIA: "🖼️", QUIZ: "✅", HTML: "🎮" };

export function LessonEditor({
  lesson,
  modules: initial,
  packages: initialPkgs,
  sections,
}: {
  lesson: LessonInfo;
  modules: EditorModule[];
  packages: PackageMap;
  sections: string[];
}) {
  const [mods, setMods] = useState(initial);
  const [pkgs, setPkgs] = useState(initialPkgs);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setMods(initial), [initial]);

  function add(type: ModuleType, at: number) {
    start(async () => {
      const m = await addModule(lesson.id, type, at);
      setMods((prev) => {
        const next = [...prev];
        next.splice(at, 0, { id: m.id, type: m.type, title: m.title, data: m.data });
        return next;
      });
      setOpen(m.id);
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= mods.length || from === to) return;
    const next = [...mods];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setMods(next);
    start(() => reorderModules(lesson.id, next.map((m) => m.id)));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/teacher" className="hover:text-brand-600">← 课时列表</Link>
          {pending && <span className="ml-auto text-xs">保存中…</span>}
        </div>
        <LessonMeta lesson={lesson} sections={sections} />

        <div>
        <AddBar onAdd={(t) => add(t, 0)} compact={mods.length > 0} />
        {mods.map((m, i) => (
          <div
            key={m.id}
            draggable={open !== m.id}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
            className={drag === i ? "opacity-40" : ""}
          >
            <ModuleCard
              index={i}
              module={m}
              icon={TYPE_ICONS[m.type]}
              open={open === m.id}
              packages={pkgs}
              onToggle={() => setOpen(open === m.id ? null : m.id)}
              onSaved={(patch) => setMods((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))}
              onPackage={(id, info) => setPkgs((p) => ({ ...p, [id]: info }))}
              onUp={() => move(i, i - 1)}
              onDown={() => move(i, i + 1)}
              onDuplicate={() => start(() => duplicateModule(m.id))}
              onDelete={() => {
                if (!confirm("删除这个模块？学生在此模块上的作答也会被删除。")) return;
                setMods((prev) => prev.filter((x) => x.id !== m.id));
                start(() => deleteModule(m.id));
              }}
            />
            <AddBar onAdd={(t) => add(t, i + 1)} compact />
          </div>
        ))}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <PublishPanel lesson={lesson} />
        <div className="card space-y-2 p-4 text-sm">
          <div className="font-semibold">预览与导出</div>
          <Link href={`/teacher/lessons/${lesson.id}/preview`} className="btn-outline w-full" target="_blank">
            以学生视角预览
          </Link>
          <a href={`/api/lessons/${lesson.id}/export`} className="btn-ghost w-full">导出为 JSON</a>
          <p className="text-xs text-slate-400">导出的文件可以在课时列表页“导入课时”，用于备份或复制到其他课程。HTML 包本身不包含在内。</p>
        </div>
        <div className="card p-4 text-xs leading-relaxed text-slate-500">
          <div className="mb-1 font-semibold text-slate-700">模块类型</div>
          {Object.entries(MODULE_LABELS).map(([k, v]) => (
            <div key={k}>{TYPE_ICONS[k as ModuleType]} {v}</div>
          ))}
          <p className="mt-2">互动内容支持上传单个 .html 文件或包含 index.html 的 .zip 包，例如小游戏、three.js 动画、滚动叙事网页。</p>
        </div>
      </aside>
    </div>
  );
}

function AddBar({ onAdd, compact }: { onAdd: (t: ModuleType) => void; compact?: boolean }) {
  const [show, setShow] = useState(!compact);
  if (!show)
    return (
      <div className="group flex h-5 items-center justify-center">
        <button
          onClick={() => setShow(true)}
          className="rounded-full border border-dashed border-slate-300 bg-white px-3 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:border-brand-500 hover:text-brand-600"
        >
          + 在此插入模块
        </button>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-3">
      <span className="text-sm text-slate-500">添加模块：</span>
      {(Object.keys(MODULE_LABELS) as ModuleType[]).map((t) => (
        <button key={t} className="btn-outline" onClick={() => { onAdd(t); if (compact) setShow(false); }}>
          {TYPE_ICONS[t]} {MODULE_LABELS[t]}
        </button>
      ))}
      {compact && <button className="btn-ghost" onClick={() => setShow(false)}>取消</button>}
    </div>
  );
}

function LessonMeta({ lesson, sections }: { lesson: LessonInfo; sections: string[] }) {
  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary);
  const [section, setSection] = useState(lesson.section);
  const [, start] = useTransition();
  const dirty = title !== lesson.title || summary !== lesson.summary || section !== lesson.section;
  return (
    <div className="card space-y-2 p-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full bg-transparent text-2xl font-bold outline-none"
        placeholder="课时名称"
      />
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        className="w-full bg-transparent text-slate-500 outline-none"
        placeholder="一句话简介（学生在课程列表里看到）"
      />
      <label className="flex items-center gap-2 text-sm text-slate-500">
        <span className="shrink-0">所属模块</span>
        <input
          value={section}
          onChange={(e) => setSection(e.target.value)}
          list="lesson-sections"
          className="input py-1.5"
          placeholder="例如：模块一 智慧运输认知与职业基础（留空则不分组）"
        />
        <datalist id="lesson-sections">
          {sections.map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>
      {dirty && (
        <button className="btn-primary" onClick={() => start(() => updateLesson(lesson.id, { title, summary, section: section.trim() }))}>
          保存
        </button>
      )}
    </div>
  );
}

function PublishPanel({ lesson }: { lesson: LessonInfo }) {
  const [mode, setMode] = useState(lesson.status);
  const [at, setAt] = useState(lesson.openAt ? toLocalInput(new Date(lesson.openAt)) : "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const changed = mode !== lesson.status || (mode === "SCHEDULED" && at !== (lesson.openAt ? toLocalInput(new Date(lesson.openAt)) : ""));

  return (
    <div className="card space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">开放设置</span>
        <StatusBadge status={lesson.status} openAt={lesson.openAt} />
      </div>
      {(
        [
          ["DRAFT", "草稿（学生看不到）"],
          ["OPEN", "立即开放"],
          ["SCHEDULED", "定时开放"],
        ] as const
      ).map(([v, label]) => (
        <label key={v} className="flex cursor-pointer items-center gap-2">
          <input type="radio" checked={mode === v} onChange={() => setMode(v)} /> {label}
        </label>
      ))}
      {mode === "SCHEDULED" && <input type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />}
      {err && <p className="text-red-600">{err}</p>}
      <button
        className="btn-primary w-full"
        disabled={!changed || pending}
        onClick={() =>
          start(async () => {
            setErr("");
            const r = await setLessonStatus(lesson.id, mode as "DRAFT", at ? new Date(at).toISOString() : null);
            if (r.error) setErr(r.error);
          })
        }
      >
        {pending ? "保存中…" : "应用"}
      </button>
    </div>
  );
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
