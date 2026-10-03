"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";

function refresh() {
  revalidatePath("/teacher/announcements");
  revalidatePath("/learn");
}

export async function postAnnouncement(fd: FormData) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  const title = String(fd.get("title") ?? "").trim().slice(0, 100);
  const body = String(fd.get("body") ?? "").trim().slice(0, 2000);
  if (!title) return;
  await db.insert(schema.announcements).values({ courseId: course.id, title, body, pinned: fd.get("pinned") === "on" });
  refresh();
}

// 只能动自己课程里的公告
async function ownAnnouncement(id: string, teacherId: string) {
  const [row] = await db
    .select({ id: schema.announcements.id, pinned: schema.announcements.pinned })
    .from(schema.announcements)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.announcements.courseId))
    .where(and(eq(schema.announcements.id, id), eq(schema.courses.teacherId, teacherId)));
  if (!row) throw new Error("公告不存在或无权限");
  return row;
}

export async function togglePin(id: string) {
  const t = await requireTeacher();
  const a = await ownAnnouncement(id, t.id);
  await db.update(schema.announcements).set({ pinned: !a.pinned }).where(eq(schema.announcements.id, id));
  refresh();
}

export async function deleteAnnouncement(id: string) {
  const t = await requireTeacher();
  await ownAnnouncement(id, t.id);
  await db.delete(schema.announcements).where(eq(schema.announcements.id, id));
  refresh();
}
