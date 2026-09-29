"use client";
import { useState, useTransition } from "react";
import { newCourse } from "./actions";

export function NewCourseTile() {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const box = "flex h-full min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 p-5 text-slate-500";
  if (!adding)
    return (
      <button type="button" onClick={() => setAdding(true)} className={`${box} transition hover:border-brand-500 hover:bg-brand-50/50 hover:text-brand-600`}>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-3xl leading-none">＋</span>
        <span className="font-medium">新建课程</span>
      </button>
    );
  return (
    <form
      className={`${box} bg-white`}
      onSubmit={(e) => { e.preventDefault(); if (title.trim()) start(() => newCourse(title)); }}
    >
      <input className="input" placeholder="课程名称" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "创建中…" : "创建"}</button>
        <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>取消</button>
      </div>
    </form>
  );
}
