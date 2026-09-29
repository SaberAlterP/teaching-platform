import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { CourseCard } from "@/components/CourseCard";
import { loadLearnData } from "./data";

export default async function LearnHome() {
  const u = await requireStudent();
  const { courses, stats, lessonsDone, overall, next } = await loadLearnData(u.id);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-linear-to-br from-brand-500 to-indigo-500 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold sm:text-3xl">你好，{u.name}</h1>
            <p className="mt-2 text-white/85">
              {courses.length ? `你正在学习 ${courses.length} 门课程，已完成 ${lessonsDone}/${stats.length} 课` : "还没有加入课程"}
            </p>
          </div>
          {stats.length > 0 && (
            <div className="w-full sm:w-64">
              <div className="mb-1.5 flex justify-between text-sm text-white/85">
                <span>总进度</span>
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

      {courses.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">老师还没有开放课程内容</div>
      ) : (
        <>
          <h2 className="text-lg font-bold">我的课程</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((c, i) => {
              const items = stats.filter((s) => s.lesson.courseId === c.id);
              const done = items.filter((s) => s.pct === 100).length;
              const pct = items.length ? Math.round((done / items.length) * 100) : 0;
              return (
                <Link key={c.id} href={`/learn/course/${c.id}`} prefetch={false} className="group block">
                  <CourseCard title={c.title} description={c.description} index={i}>
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>已完成 {done}/{items.length} 课</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </CourseCard>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
