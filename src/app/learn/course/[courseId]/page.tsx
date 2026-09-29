import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { groupBySection } from "@/lib/sections";
import { loadLearnData } from "../../data";
import { LessonTile } from "../../LessonTile";
import { ExpandAll } from "../../ExpandAll";

export default async function LearnCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const u = await requireStudent();
  const { courseId } = await params;
  const { courses, stats } = await loadLearnData(u.id);
  const course = courses.find((c) => c.id === courseId);
  if (!course) notFound();

  const items = stats.filter((s) => s.lesson.courseId === course.id);
  const lessonsDone = items.filter((s) => s.pct === 100).length;
  const allDone = items.reduce((a, s) => a + s.tile.done, 0);
  const allTotal = items.reduce((a, s) => a + s.tile.total, 0);
  const overall = allTotal ? Math.round((allDone / allTotal) * 100) : 0;
  const next = items.find((s) => s.pct < 100);
  const groups = groupBySection(items.map((s) => ({ ...s, section: s.lesson.section })));
  const grouped = groups.some((g) => g.section);
  // 默认只展开“下一节要学”所在的模块，其余收起，页面不会太长
  const openIdx = groups.findIndex((g) => g.items.some((x) => x.item.lesson.id === next?.lesson.id));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/learn" className="mb-3 inline-block text-sm text-slate-500 hover:text-brand-600">← 全部课程</Link>
        <div className="overflow-hidden rounded-2xl bg-linear-to-br from-brand-500 to-indigo-500 p-6 text-white shadow-sm sm:p-8">
          <div className="flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold sm:text-3xl">{course.title}</h1>
              {course.description && <p className="mt-2 text-white/85">{course.description}</p>}
            </div>
            {items.length > 0 && (
              <div className="w-full sm:w-64">
                <div className="mb-1.5 flex justify-between text-sm text-white/85">
                  <span>课程进度</span>
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-slate-500">
          共 {items.length} 课，已完成 <b className="text-slate-700">{lessonsDone}</b> 课
        </div>
        <div className="ml-auto hidden items-center gap-3 text-xs text-slate-500 sm:flex">
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100" />已完成</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-100" />学习中</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />未开始</span>
        </div>
        {grouped && <ExpandAll />}
      </div>
      <div className="space-y-3">
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
      </div>
    </div>
  );
}
