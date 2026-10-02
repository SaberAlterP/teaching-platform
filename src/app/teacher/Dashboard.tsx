import Link from "next/link";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const DAY = 86400_000;
const dayKey = (t: number) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10); // 北京时间的日期

// 教师首页数据看板：当前课程近 7 天的学生活跃、待批改、平均得分率，附一张迷你柱状图（纯 SVG）
export async function Dashboard({ courseId, courseTitle, classId }: { courseId: string; courseTitle: string; classId: string }) {
  const since = new Date(Date.now() - 7 * DAY);
  const students = await db
    .select({ id: schema.enrollments.userId })
    .from(schema.enrollments)
    .where(eq(schema.enrollments.classId, classId));
  const sids = students.map((s) => s.id);

  const [acts, subs, pending, rate] = await Promise.all([
    sids.length
      ? db
          .select({ userId: schema.moduleProgress.userId, at: schema.moduleProgress.completedAt })
          .from(schema.moduleProgress)
          .innerJoin(schema.modules, eq(schema.modules.id, schema.moduleProgress.moduleId))
          .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
          .where(and(eq(schema.lessons.courseId, courseId), inArray(schema.moduleProgress.userId, sids), gte(schema.moduleProgress.completedAt, since)))
      : [],
    sids.length
      ? db
          .select({ userId: schema.submissions.userId, at: schema.submissions.updatedAt })
          .from(schema.submissions)
          .innerJoin(schema.modules, eq(schema.modules.id, schema.submissions.moduleId))
          .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
          .where(and(eq(schema.lessons.courseId, courseId), inArray(schema.submissions.userId, sids), gte(schema.submissions.updatedAt, since)))
      : [],
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.submissions)
      .innerJoin(schema.modules, eq(schema.modules.id, schema.submissions.moduleId))
      .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
      .where(and(eq(schema.lessons.courseId, courseId), eq(schema.submissions.needsGrading, true))),
    sids.length
      ? db
          .select({ got: sql<number>`coalesce(sum(${schema.submissions.score}), 0)::float`, max: sql<number>`coalesce(sum(${schema.submissions.maxScore}), 0)::float` })
          .from(schema.submissions)
          .innerJoin(schema.modules, eq(schema.modules.id, schema.submissions.moduleId))
          .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
          .where(and(eq(schema.lessons.courseId, courseId), inArray(schema.submissions.userId, sids), eq(schema.submissions.needsGrading, false), sql`${schema.submissions.maxScore} > 0`))
      : [{ got: 0, max: 0 }],
  ]);

  const active = new Set([...acts, ...subs].map((r) => r.userId)).size;
  const avg = rate[0].max > 0 ? Math.round((rate[0].got / rate[0].max) * 100) : null;
  // 近 7 天每天的学习动作数（完成环节 + 提交成绩）
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => dayKey(now - (6 - i) * DAY));
  const count = new Map(days.map((d) => [d, 0]));
  for (const r of [...acts, ...subs]) {
    const k = dayKey(r.at.getTime());
    if (count.has(k)) count.set(k, count.get(k)! + 1);
  }
  const bars = days.map((d) => ({ d, n: count.get(d)! }));
  const top = Math.max(1, ...bars.map((b) => b.n));
  const week = "日一二三四五六";

  const cards = [
    { label: "近 7 天活跃学生", value: active, unit: `/ ${sids.length} 人`, tone: "text-brand-600", href: "/teacher/students" },
    { label: "待批改", value: pending[0].n, unit: "份简答", tone: pending[0].n ? "text-red-600" : "text-emerald-600", href: "/teacher/grading" },
    { label: "平均得分率", value: avg === null ? "—" : avg, unit: avg === null ? "" : "%", tone: "text-emerald-600", href: "/teacher/stats" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-end gap-3">
        <h2 className="text-2xl font-bold">学情看板</h2>
        <span className="pb-0.5 text-slate-500">{courseTitle}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[repeat(3,1fr)_1.6fr]">
        {cards.map((c, i) => (
          <Link key={c.label} href={c.href} prefetch={false} className="card tp-rise p-4 transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className={`mt-1 text-3xl font-bold ${c.tone}`}>
              {c.value}<span className="ml-1 text-sm font-normal text-slate-400">{c.unit}</span>
            </div>
          </Link>
        ))}
        <div className="card tp-rise p-4" style={{ animationDelay: "180ms" }}>
          <div className="mb-1 flex items-baseline justify-between text-sm text-slate-500">
            <span>近 7 天学习动作</span>
            <span className="text-xs text-slate-400">共 {bars.reduce((a, b) => a + b.n, 0)} 次</span>
          </div>
          <svg viewBox="0 0 210 64" className="h-16 w-full" role="img" aria-label="近 7 天每天的学习动作数">
            {bars.map((b, i) => {
              const h = b.n ? Math.max(4, (b.n / top) * 40) : 2;
              return (
                <g key={b.d}>
                  <title>{b.d}：{b.n} 次</title>
                  <rect x={i * 30 + 5} y={46 - h} width="20" height={h} rx="4" className={b.n ? "fill-brand-500" : "fill-slate-200"} opacity={i === 6 ? 1 : 0.65} />
                  <text x={i * 30 + 15} y="60" textAnchor="middle" fontSize="9" className="fill-slate-400">
                    {i === 6 ? "今" : week[new Date(Date.parse(b.d) ).getUTCDay()]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
