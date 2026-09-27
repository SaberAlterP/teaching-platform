import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { studentCourseIds, visibleLessonsFor } from "@/lib/course";

export default async function LearnHome() {
  const u = await requireStudent();
  const lessons = await visibleLessonsFor(u.id);
  const courseIds = await studentCourseIds(u.id);
  const courses = courseIds.length ? await db.select().from(schema.courses).where(inArray(schema.courses.id, courseIds)) : [];

  const ids = lessons.map((l) => l.id);
  const mods = ids.length
    ? await db.select({ id: schema.modules.id, lessonId: schema.modules.lessonId }).from(schema.modules).where(inArray(schema.modules.lessonId, ids))
    : [];
  const done = mods.length
    ? await db
        .select({ id: schema.moduleProgress.moduleId })
        .from(schema.moduleProgress)
        .where(and(eq(schema.moduleProgress.userId, u.id), inArray(schema.moduleProgress.moduleId, mods.map((m) => m.id))))
    : [];
  const doneSet = new Set(done.map((d) => d.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">你好，{u.name}</h1>
        {courses.map((c) => (
          <p key={c.id} className="mt-1 text-slate-500">
            {c.title}{c.description ? ` · ${c.description}` : ""}
          </p>
        ))}
      </div>

      {lessons.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">老师还没有开放课程内容</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((l, i) => {
            const lm = mods.filter((m) => m.lessonId === l.id);
            const d = lm.filter((m) => doneSet.has(m.id)).length;
            const pct = lm.length ? Math.round((d / lm.length) * 100) : 0;
            return (
              <Link key={l.id} href={`/learn/${l.id}`} className="card group flex flex-col p-5 transition hover:border-brand-500 hover:shadow-md">
                <div className="text-xs font-semibold text-brand-600">第 {i + 1} 课</div>
                <div className="mt-1 text-lg font-bold group-hover:text-brand-600">{l.title}</div>
                {l.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{l.summary}</p>}
                <div className="mt-auto pt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>{pct === 100 ? "已完成" : pct ? "学习中" : "未开始"}</span>
                    <span>{d}/{lm.length}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
