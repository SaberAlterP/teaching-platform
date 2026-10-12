import "server-only";
import { cookies } from "next/headers";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";

export const COURSE_COOKIE = "tp_course";

// 老师能操作的课程：自己创建的，或被邀请协作的（用在 where 条件里，需要查询里有 courses 表）
export const teachesCourse = (teacherId: string) =>
  or(
    eq(schema.courses.teacherId, teacherId),
    inArray(
      schema.courses.id,
      db.select({ id: schema.courseTeachers.courseId }).from(schema.courseTeachers).where(eq(schema.courseTeachers.userId, teacherId)),
    ),
  )!; // or() 的参数都非空时一定有结果

// 老师的全部课程（自己创建的和协作的，按创建时间）
export function listTeacherCourses(teacherId: string) {
  return db.query.courses.findMany({
    where: teachesCourse(teacherId),
    orderBy: asc(schema.courses.createdAt),
  });
}

// 新建课程，同时建一个默认班级
export async function createCourse(teacherId: string, title: string, description = "") {
  return db.transaction(async (tx) => {
    const [course] = await tx.insert(schema.courses).values({ title, description, teacherId }).returning();
    await tx.insert(schema.classes).values({ name: "默认班级", courseId: course.id });
    return course;
  });
}

// 老师当前操作的课程和班级。
// courseId 显式传入时（AI 接口）必须是自己创建或协作的课程；否则读取页面上选中的课程（Cookie），没有就用第一门。
export async function getTeacherCourse(teacherId: string, courseId?: string) {
  const all = await listTeacherCourses(teacherId);
  let course;
  if (courseId) {
    course = all.find((c) => c.id === courseId);
    if (!course) throw new Error("课程不存在或无权限");
  } else {
    const selected = (await cookies()).get(COURSE_COOKIE)?.value;
    course = all.find((c) => c.id === selected) ?? all[0];
  }
  if (!course) course = await createCourse(teacherId, "我的课程");
  let cls = await db.query.classes.findFirst({
    where: eq(schema.classes.courseId, course.id),
    orderBy: asc(schema.classes.createdAt),
  });
  if (!cls) {
    [cls] = await db.insert(schema.classes).values({ name: "默认班级", courseId: course.id }).returning();
  }
  return { course, cls, courses: all.length ? all : [course] };
}

// 老师必须能操作该课时所在的课程（创建者或协作教师）
export async function assertLessonOwner(lessonId: string, teacherId: string) {
  const [row] = await db
    .select({ lesson: schema.lessons })
    .from(schema.lessons)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
    .where(and(eq(schema.lessons.id, lessonId), teachesCourse(teacherId)));
  if (!row) throw new Error("课程不存在或无权限");
  return row.lesson;
}

export async function assertModuleOwner(moduleId: string, teacherId: string) {
  const [row] = await db
    .select({ module: schema.modules })
    .from(schema.modules)
    .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
    .where(and(eq(schema.modules.id, moduleId), teachesCourse(teacherId)));
  if (!row) throw new Error("模块不存在或无权限");
  return row.module;
}

// 课程的协作教师（不含创建者）的用户 ID
export async function courseMemberIds(courseId: string) {
  const rows = await db
    .select({ userId: schema.courseTeachers.userId })
    .from(schema.courseTeachers)
    .where(eq(schema.courseTeachers.courseId, courseId));
  return rows.map((r) => r.userId);
}

// 课程的全部授课老师：创建者排第一，协作教师按加入时间
export async function listCourseTeachers(course: { id: string; teacherId: string }) {
  const cols = { id: schema.users.id, name: schema.users.name, username: schema.users.username, email: schema.users.email };
  const [owner] = await db.select(cols).from(schema.users).where(eq(schema.users.id, course.teacherId));
  const members = await db
    .select(cols)
    .from(schema.courseTeachers)
    .innerJoin(schema.users, eq(schema.users.id, schema.courseTeachers.userId))
    .where(eq(schema.courseTeachers.courseId, course.id))
    .orderBy(asc(schema.courseTeachers.createdAt));
  return [...(owner ? [{ ...owner, owner: true }] : []), ...members.map((m) => ({ ...m, owner: false }))];
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
