"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { groupBySection } from "@/lib/sections";
import { createLesson, deleteLesson, duplicateLesson, importLesson, moveLesson, reorderLessons } from "./actions";

type L = { id: string; title: string; summary: string; section: string; status: string; openAt: string | null; moduleCount: number };

export function LessonList({ lessons: initial, otherCourses }: { lessons: L[]; otherCourses: { id: string; title: string }[] }) {
  const [lessons, setLessons] = useState(initial);
  useEffect(() => setLessons(initial), [initial]);
  const [drag, setDrag] = useState<number | null>(null);
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const groups = groupBySection(lessons);
  const grouped = groups.some((g) => g.section);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onDrop(to: number) {
    if (drag === null || drag === to) return;
    const next = [...lessons];
    const [x] = next.splice(drag, 1);
    next.splice(to, 0, x);
    setLessons(next);
    setDrag(null);
    start(() => reorderLessons(next.map((l) => l.id)));
  }

  async function onImport(f: File) {
    const r = await importLesson(await f.text());
    if (r.error) alert(r.error);
    else router.push(`/teacher/lessons/${r.id}`);
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">课时</h2>
        <span className="hidden text-sm text-slate-400 sm:inline">拖动左侧把手可调整顺序</span>
        <div className="ml-auto flex gap-2">
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          <button className="btn-outline" onClick={() => fileRef.current?.click()}>导入课时</button>
          <button className="btn-primary" onClick={() => setAdding(true)}>+ 新建课时</button>
        </div>
      </div>

      {adding && (
        <form action={createLesson} className="card mb-3 flex gap-2 p-3">
          <input name="title" className="input" placeholder="课时名称，例如：第一讲 运输方式概述" autoFocus required />
          <button className="btn-primary shrink-0">创建</button>
          <button type="button" className="btn-ghost shrink-0" onClick={() => setAdding(false)}>取消</button>
        </form>
      )}

      {lessons.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">还没有课时，点击右上角“新建课时”开始。</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g, gi) => {
            const key = `${gi}:${g.section}`;
            const isFolded = folded.has(key);
            return (
              <div key={key} className="space-y-2">
                {grouped && (
                  <button
                    className="flex w-full items-center gap-2 px-1 text-left"
                    onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                  >
                    <span className={`text-slate-400 transition ${isFolded ? "" : "rotate-90"}`}>▶</span>
                    <span className="font-bold text-slate-700">{g.section || "未分组"}</span>
                    <span className="text-sm text-slate-400">{g.items.length} 课</span>
                  </button>
                )}
                {!isFolded && (
        <ul className="space-y-2">
          {g.items.map(({ item: l, index: i }) => (
            <li
              key={l.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className={`card flex flex-wrap items-center gap-3 p-4 transition ${drag === i ? "opacity-40" : ""}`}
            >
              <span className="cursor-grab select-none text-slate-300" title="拖动排序">⋮⋮</span>
              <span className="w-8 text-center text-sm font-semibold text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex items-center gap-2">
                  <Link href={`/teacher/lessons/${l.id}`} className="truncate font-semibold hover:text-brand-600">
                    {l.title}
                  </Link>
                  <StatusBadge status={l.status} openAt={l.openAt} />
                </div>
                <div className="mt-0.5 truncate text-sm text-slate-500">
                  {l.moduleCount} 个模块{l.summary ? ` · ${l.summary}` : ""}
                </div>
              </div>
              <Link href={`/teacher/lessons/${l.id}`} className="btn-outline">编辑</Link>
              <Link href={`/teacher/lessons/${l.id}/preview`} className="btn-ghost">预览</Link>
              <button className="btn-ghost" onClick={() => start(() => duplicateLesson(l.id))}>复制</button>
              {otherCourses.length > 0 && (
                <select
                  className="select w-auto py-1.5 text-sm text-slate-600"
                  value=""
                  onChange={(e) => {
                    const c = otherCourses.find((x) => x.id === e.target.value);
                    if (c && confirm(`把"${l.title}"移到课程"${c.title}"？学生作答会一起带过去。`)) start(() => moveLesson(l.id, c.id));
                  }}
                >
                  <option value="">移到…</option>
                  {otherCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              )}
              <button
                className="btn-danger"
                onClick={() => confirm(`删除"${l.title}"？其中的模块和学生作答都会被删除。`) && start(() => deleteLesson(l.id))}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
