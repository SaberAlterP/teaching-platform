import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { greeting } from "@/lib/greeting";
import { CourseCard } from "@/components/CourseCard";
import { EmptyState } from "@/components/EmptyState";
import { ProgressRing } from "@/components/ProgressRing";
import { splitTitle } from "@/lib/sections";
import { loadLearnData } from "./data";

export const metadata = { title: "我的课程" };

function ago(t: number) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  if (m < 1440) return `${Math.round(m / 60)} 小时前`;
  return `${Math.round(m / 1440)} 天前`;
}

export default async function LearnHome() {
  const u = await requireStudent();
  const { courses, stats, lessonsDone, overall, next, recent, scoreRate, streak } = await loadLearnData(u.id);
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
  const todo = stats.length - lessonsDone;

  const kpis = [
    { icon: "📚", label: "已完成课时", value: `${lessonsDone}`, unit: `/ ${stats.length}`, tone: "bg-brand-50 text-brand-600" },
    { icon: "🎯", label: "累计得分率", value: scoreRate === null ? "—" : `${scoreRate}`, unit: scoreRate === null ? "" : "%", tone: "bg-emerald-50 text-emerald-700" },
    { icon: "🔥", label: "连续学习", value: `${streak}`, unit: "天", tone: "bg-amber-50 text-amber-700" },
    { icon: "⏳", label: "还没学完", value: `${todo}`, unit: "课", tone: "bg-sky-50 text-sky-700" },
  ];

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-brand-100 px-5 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -top-16 -left-10 h-56 w-56 rounded-full bg-brand-100 opacity-70 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-20 h-64 w-64 rounded-full bg-brand-100 opacity-70 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6 sm:gap-10">
          {stats.length > 0 && <ProgressRing pct={overall} size={112} label="总进度" className="text-brand-500" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {greeting()}，<span className="text-brand-600">{u.name}</span>
            </h1>
            <p className="mt-2 text-lg text-slate-500">
              {courses.length ? `正在学习 ${courses.length} 门课程，一步一步来，今天也加油。` : "老师还没有开放课程，先等一等吧。"}
            </p>
            {next && (
              <Link href={`/learn/${next.lesson.id}`} className="btn-primary mt-5 px-5 py-2.5 text-base shadow-sm">
                {next.pct ? "继续学习" : "开始学习"}：{splitTitle(next.lesson.title).name}
              </Link>
            )}
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <div key={k.label} className="card tp-rise flex items-center gap-3 p-4" style={{ animationDelay: `${i * 60}ms` }}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${k.tone}`} aria-hidden>{k.icon}</span>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{k.label}</div>
                <div className="text-2xl leading-tight font-bold text-slate-800">
                  {k.value}<span className="ml-0.5 text-sm font-normal text-slate-400">{k.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">最近在学</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((r) => (
              <Link key={r.lesson.id} href={`/learn/${r.lesson.id}`} prefetch={false} className="card group flex flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="truncate">{courseTitle.get(r.lesson.courseId)}</span>
                  <span className="ml-auto shrink-0">{ago(r.lastAt)}</span>
                </div>
                <div className="line-clamp-2 min-h-10 leading-snug font-semibold text-slate-800 group-hover:text-brand-600">{splitTitle(r.lesson.title).name}</div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${r.pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${r.pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-500">{r.pct === 100 ? "已完成" : `${r.pct}%`}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {courses.length === 0 ? (
        <EmptyState title="老师还没有开放课程内容" hint="老师开放课时后，这里会自动出现你的课程" />
      ) : (
        <section className="space-y-4">
          <h2 className="text-xl font-bold">我的课程</h2>
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
        </section>
      )}
    </div>
  );
}
