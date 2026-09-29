"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { groupBySection, splitTitle } from "@/lib/sections";
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
        <span className="hidden text-sm text-slate-400 sm:inline">拖动方块可调整顺序</span>
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
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {g.items.map(({ item: l, index: i }) => {
            const { no, name } = splitTitle(l.title);
            return (
              <div
                key={l.id}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`card flex min-h-40 flex-col p-3.5 transition hover:border-brand-500 hover:shadow-md ${drag === i ? "opacity-40" : ""}`}
              >
                <Link href={`/teacher/lessons/${l.id}`} className="group block flex-1">
                  <div className="flex items-start gap-2">
                    <span className="text-xl font-extrabold leading-none text-brand-600">{no || `第${i + 1}课`}</span>
                    <span className="ml-auto shrink-0"><StatusBadge status={l.status} openAt={l.openAt} /></span>
                  </div>
                  <div className="mt-2 line-clamp-3 text-[15px] leading-snug font-semibold group-hover:text-brand-600">{name}</div>
                </Link>
                <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                  <span title="拖动方块可调整顺序" className="cursor-grab text-slate-300 select-none">⋮⋮</span>
                  <span>{l.moduleCount} 个模块</span>
                  <Link href={`/teacher/lessons/${l.id}/preview`} className="btn-ghost ml-auto px-2 py-1 text-xs">预览</Link>
                  <details className="relative">
                    <summary className="btn-ghost cursor-pointer list-none px-2 py-1 text-xs select-none">更多 ▾</summary>
                    <div className="absolute right-0 bottom-full z-10 mb-1 w-44 space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                      <button className="btn-ghost w-full justify-start" onClick={() => start(() => duplicateLesson(l.id))}>复制课时</button>
                      {otherCourses.length > 0 && (
                        <select
                          className="select py-1.5 text-sm text-slate-600"
                          value=""
                          onChange={(e) => {
                            const c = otherCourses.find((x) => x.id === e.target.value);
                            if (c && confirm(`把"${l.title}"移到课程"${c.title}"？学生作答会一起带过去。`)) start(() => moveLesson(l.id, c.id));
                          }}
                        >
                          <option value="">移到其他课程…</option>
                          {otherCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                      )}
                      <button
                        className="btn-danger w-full justify-start"
                        onClick={() => confirm(`删除"${l.title}"？其中的模块和学生作答都会被删除。`) && start(() => deleteLesson(l.id))}
                      >
                        删除课时
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
