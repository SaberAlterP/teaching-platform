import "server-only";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";

// 第一期：每位老师一门课、一个班。以后做多课程时，这里改成读取"当前选中的课程"即可。
export async function getTeacherCourse(teacherId: string) {
  let course = await db.query.courses.findFirst({
    where: eq(schema.courses.teacherId, teacherId),
    orderBy: asc(schema.courses.createdAt),
  });
  if (!course) {
    [course] = await db.insert(schema.courses).values({ title: "我的课程", teacherId }).returning();
  }
  let cls = await db.query.classes.findFirst({
    where: eq(schema.classes.courseId, course.id),
    orderBy: asc(schema.classes.createdAt),
  });
  if (!cls) {
    [cls] = await db.insert(schema.classes).values({ name: "默认班级", courseId: course.id }).returning();
  }
  return { course, cls };
}

// 老师必须拥有该课时才能操作
export async function assertLessonOwner(lessonId: string, teacherId: string) {
  const [row] = await db
    .select({ lesson: schema.lessons })
    .from(schema.lessons)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
    .where(and(eq(schema.lessons.id, lessonId), eq(schema.courses.teacherId, teacherId)));
  if (!row) throw new Error("课程不存在或无权限");
  return row.lesson;
}

export async function assertModuleOwner(moduleId: string, teacherId: string) {
  const [row] = await db
    .select({ module: schema.modules })
    .from(schema.modules)
    .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
    .where(and(eq(schema.modules.id, moduleId), eq(schema.courses.teacherId, teacherId)));
  if (!row) throw new Error("模块不存在或无权限");
  return row.module;
}

// 学生所在的课程 ID 列表
export async function studentCourseIds(userId: string) {
  const rows = await db
    .select({ courseId: schema.classes.courseId })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .where(eq(schema.enrollments.userId, userId));
  return [...new Set(rows.map((r) => r.courseId))];
}

// 学生可见的课时条件：已开放，或定时开放且时间已到
export const lessonVisible = () =>
  or(
    eq(schema.lessons.status, "OPEN"),
    and(eq(schema.lessons.status, "SCHEDULED"), lte(schema.lessons.openAt, new Date())),
  );

export async function visibleLessonsFor(userId: string) {
  const ids = await studentCourseIds(userId);
  if (!ids.length) return [];
  return db
    .select()
    .from(schema.lessons)
    .where(and(inArray(schema.lessons.courseId, ids), lessonVisible()))
    .orderBy(asc(schema.lessons.order), asc(schema.lessons.createdAt));
}

// 学生能否访问某个课时（以及其中的模块）
export async function studentCanSeeLesson(userId: string, lessonId: string) {
  const ids = await studentCourseIds(userId);
  if (!ids.length) return null;
  const [l] = await db
    .select()
    .from(schema.lessons)
    .where(and(eq(schema.lessons.id, lessonId), inArray(schema.lessons.courseId, ids), lessonVisible()));
  return l ?? null;
}

export function isLessonVisible(l: { status: string; openAt: Date | null }) {
  return l.status === "OPEN" || (l.status === "SCHEDULED" && !!l.openAt && l.openAt <= new Date());
}
