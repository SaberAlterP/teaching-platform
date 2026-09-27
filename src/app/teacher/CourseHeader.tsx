"use client";
import { useState } from "react";
import { updateCourse } from "./actions";

export function CourseHeader(p: { title: string; description: string; className: string; students: number; lessons: number }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <form
        action={async (fd) => { await updateCourse(fd); setEditing(false); }}
        className="card space-y-3 p-5"
      >
        <div>
          <label className="label">课程名称</label>
          <input name="title" defaultValue={p.title} className="input" required />
        </div>
        <div>
          <label className="label">课程简介</label>
          <textarea name="description" defaultValue={p.description} className="input" rows={2} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">保存</button>
          <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>取消</button>
        </div>
      </form>
    );
  return (
    <div className="card flex flex-wrap items-start gap-4 p-5">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold">{p.title}</h1>
        {p.description && <p className="mt-1 text-slate-500">{p.description}</p>}
        <div className="mt-3 flex gap-4 text-sm text-slate-500">
          <span>班级：{p.className}</span>
          <span>学生 {p.students} 人</span>
          <span>课时 {p.lessons} 个</span>
        </div>
      </div>
      <button className="btn-outline" onClick={() => setEditing(true)}>编辑课程信息</button>
    </div>
  );
}
