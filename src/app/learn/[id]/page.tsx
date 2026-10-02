import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { studentCanSeeLesson } from "@/lib/course";
import { loadLessonView } from "@/lib/lesson-data";
import { LessonView } from "@/components/modules/LessonView";

export default async function StudentLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStudent();
  const { id } = await params;
  const lesson = await studentCanSeeLesson(u.id, id);
  if (!lesson) notFound();
  const [v, course] = await Promise.all([
    loadLessonView(id, u.id),
    db.query.courses.findFirst({ where: eq(schema.courses.id, lesson.courseId), columns: { title: true } }),
  ]);
  return (
    <div>
      <Link href={`/learn/course/${lesson.courseId}`} className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-600">← 返回课程</Link>
      <LessonView title={lesson.title} summary={lesson.summary} courseTitle={course?.title} {...v} backHref={`/learn/course/${lesson.courseId}`} />
    </div>
  );
}
