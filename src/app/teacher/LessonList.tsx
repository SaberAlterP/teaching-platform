"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { groupBySection, splitTitle } from "@/lib/sections";
import { createLesson, deleteLesson, duplicateLesson, importLesson, moveLesson, reorderLessons, setLessonsStatus } from "./actions";

type L = { id: string; title: string; summary: string; section: string; status: string; openAt: string | null; moduleCount: number };

export function LessonList({ lessons: initial, otherCourses }: { lessons: L[]; otherCourses: { id: string; title: string }[] }) {
  const [lessons, setLessons] = useState(initial);
  useEffect(() => setLessons(initial), [initial]);
  const [drag, setDrag] = useState<number | null>(null);
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "draft" | "open">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const isOpen = (l: L) => l.status === "OPEN" || (l.status === "SCHEDULED" && !!l.openAt && new Date(l.openAt) <= new Date());
  const nOpen = lessons.filter(isOpen).length;
  const nDraft = lessons.filter((l) => l.status === "DRAFT").length;
  const nSched = lessons.length - nOpen - nDraft;
  const visible = (l: L) => filter === "all" || (filter === "draft" ? l.status === "DRAFT" : isOpen(l));
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

  function toggle(ids: string[], on: boolean) {
    setSel((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  }

  function batch(ids: string[], status: "OPEN" | "DRAFT") {
    if (!ids.length) return;
    if (status === "OPEN" && !confirm(`把 ${ids.length} 个课时设为“已开放”？学生马上就能看到。`)) return;
    if (status === "DRAFT" && !confirm(`把 ${ids.length} 个课时设回草稿？学生将看不到它们。`)) return;
    start(async () => { await setLessonsStatus(ids, status); setSel(new Set()); });
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

      {lessons.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {([
            ["all", `全部 ${lessons.length}`, "bg-slate-100 text-slate-700"],
            ["draft", `草稿 ${nDraft}`, "bg-amber-50 text-amber-700"],
            ["open", `已开放 ${nOpen}`, "bg-emerald-50 text-emerald-700"],
          ] as const).map(([k, label, cls]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 font-medium ${cls} ${filter === k ? "ring-2 ring-brand-500" : "opacity-80 hover:opacity-100"}`}
            >
              {label}
            </button>
          ))}
          {nSched > 0 && <span className="text-slate-400">定时 {nSched}</span>}
          <button
            className="btn-ghost ml-auto px-2 py-1 text-xs"
            onClick={() => {
              const ids = lessons.filter(visible).map((l) => l.id);
              const all = ids.every((id) => sel.has(id));
              toggle(ids, !all);
            }}
          >
            {lessons.filter(visible).every((l) => sel.has(l.id)) ? "取消全选" : "全选当前"}
          </button>
        </div>
      )}

      {sel.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500 bg-white p-2.5 shadow-lg">
          <span className="px-1 text-sm font-medium">已选 {sel.size} 个课时</span>
          <button className="btn-primary" onClick={() => batch([...sel], "OPEN")}>批量开放</button>
          <button className="btn-outline" onClick={() => batch([...sel], "DRAFT")}>设为草稿</button>
          <button className="btn-ghost ml-auto" onClick={() => setSel(new Set())}>取消选择</button>
        </div>
      )}

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
                  <div className="flex items-center gap-1">
                  <button
                    className="flex w-full items-center gap-2 px-1 text-left"
                    onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                  >
                    <span className={`text-slate-400 transition ${isFolded ? "" : "rotate-90"}`}>▶</span>
                    <span className="font-bold text-slate-700">{g.section || "未分组"}</span>
                    <span className="text-sm text-slate-400">
                      {g.items.length} 课 · 草稿 {g.items.filter((x) => x.item.status === "DRAFT").length}
                    </span>
                  </button>
                  <button
                    className="btn-ghost shrink-0 px-2 py-1 text-xs"
                    onClick={() => {
                      const ids = g.items.filter((x) => visible(x.item)).map((x) => x.item.id);
                      toggle(ids, !ids.every((id) => sel.has(id)));
                    }}
                  >
                    选择本组
                  </button>
                  </div>
                )}
                {!isFolded && (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {g.items.map(({ item: l, index: i }) => {
            if (!visible(l)) return null;
            const { no, name } = splitTitle(l.title);
            const draft = l.status === "DRAFT";
            return (
              <div
                key={l.id}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`card relative flex min-h-40 flex-col p-3.5 transition hover:border-brand-500 hover:shadow-md ${drag === i ? "opacity-40" : ""} ${draft ? "border-dashed bg-slate-50" : ""} ${sel.has(l.id) ? "ring-2 ring-brand-500" : ""}`}
              >
                <input
              type="checkbox"
              aria-label="选择课时"
              className="absolute top-[18px] left-3.5 z-10 h-4 w-4 cursor-pointer"
              checked={sel.has(l.id)}
              onChange={(e) => toggle([l.id], e.target.checked)}
            />
                <Link href={`/teacher/lessons/${l.id}`} prefetch={false} className="group block flex-1">
                  <div className="flex items-start gap-2">
                    <span className="pl-6 text-xl font-extrabold leading-none text-brand-600">{no || `第${i + 1}课`}</span>
                    <span className="ml-auto shrink-0"><StatusBadge status={l.status} openAt={l.openAt} /></span>
                  </div>
                  <div className="mt-2 line-clamp-3 text-[15px] leading-snug font-semibold group-hover:text-brand-600">{name}</div>
                </Link>
                <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                  <span title="拖动方块可调整顺序" className="cursor-grab text-slate-300 select-none">⋮⋮</span>
                  <span>{l.moduleCount} 个模块</span>
                  <Link href={`/teacher/lessons/${l.id}/preview`} prefetch={false} className="btn-ghost ml-auto px-2 py-1 text-xs">预览</Link>
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
