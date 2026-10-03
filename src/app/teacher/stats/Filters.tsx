"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Opt = { id: string; label: string };

export function Filters({ lessons, classes, lesson, cls }: { lessons: Opt[]; classes: Opt[]; lesson: string; cls: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    const q = p.toString();
    router.replace(q ? `${path}?${q}` : path);
  }

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {classes.length > 1 && (
        <select className="select w-auto py-1.5 text-sm" value={cls} onChange={(e) => set("cls", e.target.value)}>
          <option value="">全部班级</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      )}
      <select className="select w-auto max-w-[16rem] py-1.5 text-sm" value={lesson} onChange={(e) => set("lesson", e.target.value)}>
        <option value="">全部课时</option>
        {lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
      {(lesson || cls) && (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => router.replace(path)}>清除筛选</button>
      )}
    </div>
  );
}
