import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { studentCourseIds, visibleLessonsFor } from "@/lib/course";
import { groupBySection } from "@/lib/sections";
import type { HtmlData, QuizData } from "@/lib/modules";
import { LessonTile, type TileInfo } from "./LessonTile";
import { ExpandAll } from "./ExpandAll";

export default async function LearnHome() {
  const u = await requireStudent();
  const lessons = await visibleLessonsFor(u.id);
  const courseIds = await studentCourseIds(u.id);
  const courses = courseIds.length
    ? await db.select().from(schema.courses).where(inArray(schema.courses.id, courseIds)).orderBy(asc(schema.courses.createdAt))
    : [];

  const ids = lessons.map((l) => l.id);
  const mods = ids.length
    ? await db.select({ id: schema.modules.id, lessonId: schema.modules.lessonId, type: schema.modules.type }).from(schema.modules).where(inArray(schema.modules.lessonId, ids))
    : [];
  const done = mods.length
    ? await db
        .select({ id: schema.moduleProgress.moduleId })
        .from(schema.moduleProgress)
        .where(and(eq(schema.moduleProgress.userId, u.id), inArray(schema.moduleProgress.moduleId, mods.map((m) => m.id))))
    : [];
  const doneSet = new Set(done.map((d) => d.id));

  // 计分项（习题、可计分的互动内容）：只取需要算满分的数据，避免把图文正文都读出来
  const scoredMods = ids.length
    ? await db
        .select({ id: schema.modules.id, lessonId: schema.modules.lessonId, type: schema.modules.type, data: schema.modules.data })
        .from(schema.modules)
        .where(and(inArray(schema.modules.lessonId, ids), inArray(schema.modules.type, ["QUIZ", "HTML"])))
    : [];
  const scoredList = scoredMods
    .map((m) => ({
      id: m.id,
      lessonId: m.lessonId,
      max: m.type === "QUIZ"
        ? (m.data as unknown as QuizData).questions.reduce((a, q) => a + q.points, 0)
        : (m.data as unknown as HtmlData).scored ? ((m.data as unknown as HtmlData).maxScore ?? 100) : 0,
    }))
    .filter((m) => m.max > 0);
  const subs = scoredList.length
    ? await db
        .select({ moduleId: schema.submissions.moduleId, score: schema.submissions.score })
        .from(schema.submissions)
        .where(and(eq(schema.submissions.userId, u.id), inArray(schema.submissions.moduleId, scoredList.map((m) => m.id))))
    : [];
  const subScore = new Map(subs.map((s) => [s.moduleId, s.score]));

  // 按课程排列，这样“继续学习”先走完第一门课
  const courseRank = new Map(courses.map((c, i) => [c.id, i]));
  const ordered = [...lessons].sort((a, b) => (courseRank.get(a.courseId) ?? 0) - (courseRank.get(b.courseId) ?? 0));
  const stats = ordered.map((l) => {
    const lm = mods.filter((m) => m.lessonId === l.id);
    const d = lm.filter((m) => doneSet.has(m.id)).length;
    const sm = scoredList.filter((m) => m.lessonId === l.id);
    const got = sm.filter((m) => subScore.has(m.id));
    const tile: TileInfo = {
      id: l.id,
      title: l.title,
      summary: l.summary,
      done: d,
      total: lm.length,
      pct: lm.length ? Math.round((d / lm.length) * 100) : 0,
      hasHtml: lm.some((m) => m.type === "HTML"),
      hasQuiz: lm.some((m) => m.type === "QUIZ"),
      hasText: lm.some((m) => m.type === "RICHTEXT" || m.type === "MEDIA"),
      score: got.length ? got.reduce((a, m) => a + (subScore.get(m.id) ?? 0), 0) : null,
      maxScore: sm.reduce((a, m) => a + m.max, 0),
    };
    return { lesson: l, tile, pct: tile.pct };
  });
  const lessonsDone = stats.filter((s) => s.pct === 100).length;
  const allDone = stats.reduce((a, s) => a + s.tile.done, 0);
  const allTotal = stats.reduce((a, s) => a + s.tile.total, 0);
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
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-500">
              共 {stats.length} 课，已完成 <b className="text-slate-700">{lessonsDone}</b> 课
            </div>
            <div className="ml-auto hidden items-center gap-3 text-xs text-slate-500 sm:flex">
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100" />已完成</span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-100" />学习中</span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />未开始</span>
            </div>
            {stats.some((s) => s.lesson.section) && <ExpandAll />}
          </div>
          {courses
            .map((c) => ({ c, items: stats.filter((s) => s.lesson.courseId === c.id) }))
            .filter((g) => g.items.length)
            .map(({ c, items }) => {
              const groups = groupBySection(items.map((s) => ({ ...s, section: s.lesson.section })));
              const grouped = groups.some((g) => g.section);
              // 默认只展开“下一节要学”所在的模块，其余收起，页面不会太长
              const openIdx = groups.findIndex((g) => g.items.some((x) => x.item.lesson.id === next?.lesson.id));
              return (
                <section key={c.id} className="space-y-3">
                  {courses.length > 1 && <h2 className="text-lg font-bold">{c.title}</h2>}
                  {groups.map((g, gi) => {
                    const grid = (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {g.items.map(({ item, index }) => (
                          <LessonTile key={item.lesson.id} t={item.tile} fallbackNo={`第${index + 1}课`} />
                        ))}
                      </div>
                    );
                    if (!g.section)
                      return (
                        <div key={gi} className="space-y-2">
                          {grouped && <div className="py-1 font-bold text-slate-700">其他课时</div>}
                          {grid}
                        </div>
                      );
                    const gDone = g.items.filter((x) => x.item.pct === 100).length;
                    const gPct = Math.round((gDone / g.items.length) * 100);
                    return (
                      <details key={gi} data-section open={gi === openIdx} className="group/sec card px-4 py-3 sm:px-5">
                        <summary className="flex cursor-pointer list-none items-center gap-3 select-none">
                          <span className="text-xs text-slate-400 transition group-open/sec:rotate-90">▶</span>
                          <span className="min-w-0 flex-1 truncate font-bold text-slate-800">{g.section}</span>
                          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                            <span className={`block h-full rounded-full ${gPct === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${gPct}%` }} />
                          </span>
                          <span className="shrink-0 text-sm text-slate-400">{gDone}/{g.items.length} 课</span>
                        </summary>
                        <div className="pt-3">{grid}</div>
                      </details>
                    );
                  })}
                </section>
              );
            })}
        </>
      )}
    </div>
  );
}
