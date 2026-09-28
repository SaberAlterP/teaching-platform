import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { assertLessonOwner } from "@/lib/course";
import type { HtmlData } from "@/lib/modules";
import { LessonEditor } from "./LessonEditor";

export default async function LessonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  const { id } = await params;
  const lesson = await assertLessonOwner(id, t.id).catch(() => null);
  if (!lesson) notFound();
  const mods = await db.query.modules.findMany({
    where: eq(schema.modules.lessonId, id),
    orderBy: asc(schema.modules.order),
  });
  // HTML 包的文件信息
  const assetIds = mods.filter((m) => m.type === "HTML").map((m) => (m.data as unknown as HtmlData).assetId).filter(Boolean);
  const assets = assetIds.length
    ? await db.select().from(schema.assets).where(inArray(schema.assets.id, assetIds))
    : [];

  // 本课程已有的模块名，供“所属模块”输入框提示
  const sections = await db
    .selectDistinct({ s: schema.lessons.section })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, lesson.courseId));

  return (
    <LessonEditor
      lesson={{
        id: lesson.id,
        title: lesson.title,
        summary: lesson.summary,
        section: lesson.section,
        status: lesson.status,
        openAt: lesson.openAt?.toISOString() ?? null,
      }}
      sections={sections.map((x) => x.s).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN"))}
      modules={mods.map((m) => ({ id: m.id, type: m.type, title: m.title, data: m.data }))}
      packages={Object.fromEntries(assets.map((a) => [a.id, { filename: a.filename, url: `/pkg/${a.id}/${a.entry}` }]))}
    />
  );
}
