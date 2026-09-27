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

  const stats = lessons.map((l) => {
    const lm = mods.filter((m) => m.lessonId === l.id);
    const d = lm.filter((m) => doneSet.has(m.id)).length;
    return { lesson: l, done: d, total: lm.length, pct: lm.length ? Math.round((d / lm.length) * 100) : 0 };
  });
  const allDone = stats.reduce((a, s) => a + s.done, 0);
  const allTotal = stats.reduce((a, s) => a + s.total, 0);
  const overall = allTotal ? Math.round((allDone / allTotal) * 100) : 0;
  const next = stats.find((s) => s.pct < 100);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-linear-to-br from-brand-500 to-indigo-500 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold sm:text-3xl">你好，{u.name}</h1>
            {courses.map((c) => (
              <p key={c.id} className="mt-2 text-white/85">
                {c.title}{c.description ? ` · ${c.description}` : ""}
              </p>
            ))}
          </div>
          {stats.length > 0 && (
            <div className="w-full sm:w-64">
              <div className="mb-1.5 flex justify-between text-sm text-white/85">
                <span>课程总进度</span>
                <span>{overall}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white" style={{ width: `${overall}%` }} />
              </div>
              {next && (
                <Link href={`/learn/${next.lesson.id}`} className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
                  {next.pct ? "继续学习" : "开始学习"}：{next.lesson.title}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {stats.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">老师还没有开放课程内容</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(({ lesson: l, done: d, total, pct }, i) => (
            <Link key={l.id} href={`/learn/${l.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-brand-600">第 {i + 1} 课</span>
                <span
                  className={`badge ml-auto ${
                    pct === 100 ? "bg-emerald-50 text-emerald-700" : pct ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {pct === 100 ? "已完成" : pct ? "学习中" : "未开始"}
                </span>
              </div>
              <div className="mt-2 text-lg font-bold group-hover:text-brand-600">{l.title}</div>
              {l.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{l.summary}</p>}
              <div className="mt-auto pt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{d}/{total} 个环节</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
