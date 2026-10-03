import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";
import { StudentsClient } from "./StudentsClient";

export const metadata = { title: "学生" };

export default async function StudentsPage() {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  const classes = await db.select().from(schema.classes).where(eq(schema.classes.courseId, course.id)).orderBy(asc(schema.classes.createdAt));
  const students = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      name: schema.users.name,
      lastLoginAt: schema.users.lastLoginAt,
      classId: schema.enrollments.classId,
    })
    .from(schema.users)
    .innerJoin(schema.enrollments, eq(schema.enrollments.userId, schema.users.id))
    .where(inArray(schema.enrollments.classId, classes.map((c) => c.id)))
    .orderBy(asc(schema.users.username));

  // 每个学生完成的模块数
  const lessonIds = (await db.select({ id: schema.lessons.id }).from(schema.lessons).where(eq(schema.lessons.courseId, course.id))).map((l) => l.id);
  const totalModules = lessonIds.length
    ? (await db.select({ n: sql<number>`count(*)::int` }).from(schema.modules).where(inArray(schema.modules.lessonId, lessonIds)))[0].n
    : 0;
  const progress = lessonIds.length && students.length
    ? await db
        .select({ userId: schema.moduleProgress.userId, n: sql<number>`count(*)::int` })
        .from(schema.moduleProgress)
        .innerJoin(schema.modules, eq(schema.modules.id, schema.moduleProgress.moduleId))
        .where(inArray(schema.modules.lessonId, lessonIds))
        .groupBy(schema.moduleProgress.userId)
    : [];
  const pmap = new Map(progress.map((p) => [p.userId, p.n]));

  return (
    <StudentsClient
      className={course.title}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      totalModules={totalModules}
      students={students.map((s) => ({
        ...s,
        lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
        done: pmap.get(s.id) ?? 0,
      }))}
    />
  );
}
