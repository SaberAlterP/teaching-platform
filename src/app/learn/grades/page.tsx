import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { visibleLessonsFor } from "@/lib/course";
import { MODULE_LABELS, type HtmlData, type QuizData } from "@/lib/modules";

export default async function GradesPage() {
  const u = await requireStudent();
  const lessons = await visibleLessonsFor(u.id);
  const courseIds = [...new Set(lessons.map((l) => l.courseId))];
  const courses = courseIds.length ? await db.select().from(schema.courses).where(inArray(schema.courses.id, courseIds)) : [];
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
  const multi = courses.length > 1;
  const ids = lessons.map((l) => l.id);
  const mods = ids.length ? await db.select().from(schema.modules).where(inArray(schema.modules.lessonId, ids)) : [];
  const scored = mods.filter((m) => m.type === "QUIZ" || (m.type === "HTML" && (m.data as unknown as HtmlData).scored));
  const subs = await db.select().from(schema.submissions).where(eq(schema.submissions.userId, u.id));
  const subMap = new Map(subs.map((s) => [s.moduleId, s]));

  let got = 0;
  let total = 0;
  const rows = lessons.flatMap((l) =>
    scored
      .filter((m) => m.lessonId === l.id)
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const s = subMap.get(m.id);
        const max = m.type === "QUIZ"
          ? (m.data as unknown as QuizData).questions.reduce((a, b) => a + b.points, 0)
          : (m.data as unknown as HtmlData).maxScore ?? 100;
        total += max;
        got += s?.score ?? 0;
        return { lesson: l, m, s, max };
      }),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <h1 className="text-2xl font-bold">我的成绩</h1>
        <span className="text-slate-500">累计 {got} / {total} 分</span>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {multi && <th className="px-4 py-2.5 font-medium">课程</th>}
              <th className="px-4 py-2.5 font-medium">课时</th>
              <th className="px-4 py-2.5 font-medium">项目</th>
              <th className="px-4 py-2.5 font-medium">得分</th>
              <th className="px-4 py-2.5 font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ lesson, m, s, max }) => (
              <tr key={m.id}>
                {multi && <td className="px-4 py-2.5 text-slate-500">{courseTitle.get(lesson.courseId)}</td>}
                <td className="px-4 py-2.5">
                  <Link href={`/learn/${lesson.id}#m-${m.id}`} className="hover:text-brand-600">{lesson.title}</Link>
                </td>
                <td className="px-4 py-2.5">{m.title || MODULE_LABELS[m.type]}</td>
                <td className="px-4 py-2.5 font-medium">{s ? `${s.score} / ${max}` : "—"}</td>
                <td className="px-4 py-2.5">
                  {!s ? (
                    <span className="badge bg-slate-100 text-slate-500">未完成</span>
                  ) : s.needsGrading ? (
                    <span className="badge bg-amber-50 text-amber-700">待批改</span>
                  ) : (
                    <span className="badge bg-emerald-50 text-emerald-700">已完成</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={multi ? 5 : 4} className="px-4 py-8 text-center text-slate-400">暂无计分项目</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
