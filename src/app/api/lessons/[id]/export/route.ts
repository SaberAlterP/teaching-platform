import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { assertLessonOwner } from "@/lib/course";

// 导出课时为 JSON（备份、复制到别的课程，或交给 AI 修改后再导入）
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "TEACHER") return new Response("无权限", { status: 403 });
  const { id } = await params;
  const lesson = await assertLessonOwner(id, s.uid).catch(() => null);
  if (!lesson) return new Response("Not found", { status: 404 });
  const mods = await db.query.modules.findMany({ where: eq(schema.modules.lessonId, id), orderBy: asc(schema.modules.order) });
  const body = {
    format: "teaching-platform/lesson@1",
    title: lesson.title,
    summary: lesson.summary,
    section: lesson.section,
    modules: mods.map((m) => ({ type: m.type, title: m.title, data: m.data })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(lesson.title)}.json`,
    },
  });
}
