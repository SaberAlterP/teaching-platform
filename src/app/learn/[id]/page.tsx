import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { studentCanSeeLesson, visibleLessonsFor } from "@/lib/course";
import { splitTitle } from "@/lib/sections";
import { loadLessonView } from "@/lib/lesson-data";
import { LessonView } from "@/components/modules/LessonView";

export default async function StudentLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStudent();
  const { id } = await params;
  const lesson = await studentCanSeeLesson(u.id, id);
  if (!lesson) notFound();
  const [v, course, visible] = await Promise.all([
    loadLessonView(id, u.id),
    db.query.courses.findFirst({ where: eq(schema.courses.id, lesson.courseId), columns: { title: true } }),
    visibleLessonsFor(u.id),
  ]);
  // 上一课/下一课只在本课程里已开放的课时之间翻页，老师没开放的不会出现
  const sameCourse = visible.filter((l) => l.courseId === lesson.courseId);
  const idx = sameCourse.findIndex((l) => l.id === id);
  const prev = idx > 0 ? sameCourse[idx - 1] : null;
  const next = idx >= 0 && idx < sameCourse.length - 1 ? sameCourse[idx + 1] : null;
  const pager = (prev || next) && (
    <nav className="flex items-stretch justify-between gap-3" aria-label="课时翻页">
      {prev ? (
        <Link href={`/learn/${prev.id}`} className="card flex min-w-0 max-w-[48%] flex-col px-4 py-2.5 text-left transition hover:border-brand-500">
          <span className="text-xs text-slate-400">← 上一课</span>
          <span className="truncate text-sm font-medium text-slate-700">{splitTitle(prev.title).name}</span>
        </Link>
      ) : <span />}
      {next ? (
        <Link href={`/learn/${next.id}`} className="card ml-auto flex min-w-0 max-w-[48%] flex-col px-4 py-2.5 text-right transition hover:border-brand-500">
          <span className="text-xs text-slate-400">下一课 →</span>
          <span className="truncate text-sm font-medium text-slate-700">{splitTitle(next.title).name}</span>
        </Link>
      ) : <span />}
    </nav>
  );
  return (
    <div className="space-y-4">
      <Link href={`/learn/course/${lesson.courseId}`} className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-600">← 返回课程</Link>
      <LessonView title={lesson.title} summary={lesson.summary} courseTitle={course?.title} {...v} backHref={`/learn/course/${lesson.courseId}`} />
      {pager}
    </div>
  );
}
