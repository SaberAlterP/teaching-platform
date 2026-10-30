import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

// 老师端侧边目录：本课程全部课时（含草稿），点击进入编辑页或预览页
export async function courseToc(courseId: string, mode: "edit" | "preview") {
  const rows = await db
    .select({ id: schema.lessons.id, title: schema.lessons.title, section: schema.lessons.section, status: schema.lessons.status })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, courseId))
    .orderBy(asc(schema.lessons.order), asc(schema.lessons.createdAt));
  return rows.map((l) => ({
    ...l,
    href: mode === "edit" ? `/teacher/lessons/${l.id}` : `/teacher/lessons/${l.id}/preview`,
  }));
}
