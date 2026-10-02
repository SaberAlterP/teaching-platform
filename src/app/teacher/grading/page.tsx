import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";
import type { QuizData } from "@/lib/modules";
import { GradeItem } from "./GradeItem";

export const metadata = { title: "批改" };

export default async function GradingPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  const showAll = (await searchParams).all === "1";

  const rows = await db
    .select({ sub: schema.submissions, module: schema.modules, lesson: schema.lessons, user: { name: schema.users.name, username: schema.users.username } })
    .from(schema.submissions)
    .innerJoin(schema.modules, eq(schema.modules.id, schema.submissions.moduleId))
    .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
    .innerJoin(schema.users, eq(schema.users.id, schema.submissions.userId))
    .where(and(eq(schema.lessons.courseId, course.id), eq(schema.modules.type, "QUIZ"), showAll ? undefined : eq(schema.submissions.needsGrading, true)))
    .orderBy(asc(schema.lessons.order), asc(schema.modules.order), desc(schema.submissions.updatedAt))
    .limit(300);

  // 展开为"每道简答题一条"
  const items = rows.flatMap((r) => {
    const quiz = r.module.data as unknown as QuizData;
    return quiz.questions
      .filter((q) => q.type === "short")
      .filter((q) => showAll || r.sub.itemScores[q.id] === null)
      .map((q) => ({
        key: `${r.sub.id}:${q.id}`,
        submissionId: r.sub.id,
        questionId: q.id,
        lesson: r.lesson.title,
        module: r.module.title,
        prompt: q.prompt,
        reference: String(q.answer ?? ""),
        points: q.points,
        answer: String(r.sub.answers[q.id] ?? ""),
        current: r.sub.itemScores[q.id] ?? null,
        student: `${r.user.name}（${r.user.username}）`,
      }));
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <h1 className="text-2xl font-bold">批改简答题</h1>
        <span className="text-slate-500">{showAll ? `共 ${items.length} 条作答` : `待批改 ${items.length} 条`}</span>
        <a href={showAll ? "/teacher/grading" : "/teacher/grading?all=1"} className="btn-ghost ml-auto">
          {showAll ? "只看待批改" : "查看全部（可修改已批分数）"}
        </a>
      </div>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">🎉 没有需要批改的作答</div>
      ) : (
        items.map(({ key, ...it }) => <GradeItem key={key} {...it} />)
      )}
    </div>
  );
}
