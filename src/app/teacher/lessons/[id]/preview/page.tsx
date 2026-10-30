import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonShell } from "@/components/LessonToc";
import { requireTeacher } from "@/lib/auth";
import { assertLessonOwner } from "@/lib/course";
import { loadLessonView } from "@/lib/lesson-data";
import { LessonView } from "@/components/modules/LessonView";
import { courseToc } from "@/lib/toc";
import { LessonAiDock } from "../../../assistant/LessonAiDock";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  const { id } = await params;
  const lesson = await assertLessonOwner(id, t.id, "view").catch(() => null);
  if (!lesson) notFound();
  const canEdit = !!(await assertLessonOwner(id, t.id).catch(() => null));
  const v = await loadLessonView(id);
  const toc = await courseToc(lesson.courseId, "preview");
  return (
    <LessonShell lessons={toc} currentId={id}>
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
        预览模式：这是学生看到的样子。作答只在本地判分，不会保存。
        {canEdit ? (
          <Link href={`/teacher/lessons/${id}`} className="ml-auto font-medium underline">返回编辑</Link>
        ) : (
          <Link href="/teacher/course" className="ml-auto font-medium underline">返回课时列表</Link>
        )}
      </div>
      <LessonView title={lesson.title} summary={lesson.summary} {...v} preview />
      <LessonAiDock teacherId={t.id} lesson={{ id: lesson.id, title: lesson.title }} />
    </div>
    </LessonShell>
  );
}
