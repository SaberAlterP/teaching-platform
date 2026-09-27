import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { studentCanSeeLesson } from "@/lib/course";
import { loadLessonView } from "@/lib/lesson-data";
import { LessonView } from "@/components/modules/LessonView";

export default async function StudentLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStudent();
  const { id } = await params;
  const lesson = await studentCanSeeLesson(u.id, id);
  if (!lesson) notFound();
  const v = await loadLessonView(id, u.id);
  return (
    <div>
      <Link href="/learn" className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-600">← 返回课程</Link>
      <LessonView title={lesson.title} summary={lesson.summary} {...v} backHref="/learn" />
    </div>
  );
}
