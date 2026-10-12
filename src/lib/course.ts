import "server-only";
import { cookies } from "next/headers";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { canEditCourse, courseRole, type Member } from "./course-teachers";

export const COURSE_COOKIE = "tp_course";

// 课程权限条件（用在 where 条件里，需要查询里有 courses 表）：
// - edit：自己创建的，或被邀请共建（can_edit）的课程——所有修改操作都用它；
// - view：再加上仅浏览的课程——只给查看页面用。
const courseAccess = (teacherId: string, mode: "edit" | "view") =>
  or(
    eq(schema.courses.teacherId, teacherId),
    inArray(
      schema.courses.id,
      db
        .select({ id: schema.courseTeachers.courseId })
        .from(schema.courseTeachers)
        .where(and(eq(schema.courseTeachers.userId, teacherId), mode === "edit" ? eq(schema.courseTeachers.canEdit, true) : undefined)),
    ),
  )!; // or() 的参数都非空时一定有结果

// 能修改的课程（默认用这个：漏改的地方对仅浏览的老师也是拒绝，不会误放行）
export const teachesCourse = (teacherId: string) => courseAccess(teacherId, "edit");
// 能查看的课程（含仅浏览）
export const viewsCourse = (teacherId: string) => courseAccess(teacherId, "view");

// 老师的全部课程（自己创建的、共建的、仅浏览的，按创建时间）
export function listTeacherCourses(teacherId: string) {
  return db.query.courses.findMany({
    where: viewsCourse(teacherId),
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

// 老师当前查看的课程和班级，以及他在这门课的身份（role）、能否修改（canEdit）。
// courseId 显式传入时必须是他能看到的课程；否则读取页面上选中的课程（Cookie），没有就用第一门。
// 注意：仅浏览的课程也会返回，要修改内容请用 getEditableCourse。
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
  const role = courseRole(course, teacherId, await courseMembers(course.id));
  return { course, cls, courses: all.length ? all : [course], role, canEdit: canEditCourse(role) };
}

export const VIEW_ONLY_ERROR = "你在这门课是仅浏览权限，不能修改";

// 要修改当前课程时用：仅浏览的老师会被拒绝
export async function getEditableCourse(teacherId: string, courseId?: string) {
  const r = await getTeacherCourse(teacherId, courseId);
  if (!r.canEdit) throw new Error(VIEW_ONLY_ERROR);
  return r;
}

// 老师必须能修改该课时所在的课程（创建者或共建老师）；只是查看时传 mode = "view"（仅浏览的老师也可以）
export async function assertLessonOwner(lessonId: string, teacherId: string, mode: "edit" | "view" = "edit") {
  const [row] = await db
    .select({ lesson: schema.lessons })
    .from(schema.lessons)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
    .where(and(eq(schema.lessons.id, lessonId), courseAccess(teacherId, mode)));
  if (!row) throw new Error("课程不存在或无权限");
  return row.lesson;
}

export async function assertModuleOwner(moduleId: string, teacherId: string, mode: "edit" | "view" = "edit") {
  const [row] = await db
    .select({ module: schema.modules })
    .from(schema.modules)
    .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
    .where(and(eq(schema.modules.id, moduleId), courseAccess(teacherId, mode)));
  if (!row) throw new Error("模块不存在或无权限");
  return row.module;
}

// 课程的协作教师（不含创建者）及其权限
export function courseMembers(courseId: string): Promise<Member[]> {
  return db
    .select({ userId: schema.courseTeachers.userId, canEdit: schema.courseTeachers.canEdit })
    .from(schema.courseTeachers)
    .where(eq(schema.courseTeachers.courseId, courseId));
}

// 课程的全部授课老师：创建者排第一，协作教师按加入时间
export async function listCourseTeachers(course: { id: string; teacherId: string }) {
  const cols = { id: schema.users.id, name: schema.users.name, username: schema.users.username, email: schema.users.email };
  const [owner] = await db.select(cols).from(schema.users).where(eq(schema.users.id, course.teacherId));
  const members = await db
    .select({ ...cols, canEdit: schema.courseTeachers.canEdit })
    .from(schema.courseTeachers)
    .innerJoin(schema.users, eq(schema.users.id, schema.courseTeachers.userId))
    .where(eq(schema.courseTeachers.courseId, course.id))
    .orderBy(asc(schema.courseTeachers.createdAt));
  return [...(owner ? [{ ...owner, owner: true, canEdit: true }] : []), ...members.map((m) => ({ ...m, owner: false }))];
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
