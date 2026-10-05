"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, count, eq, inArray, max, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, requireTeacher } from "@/lib/auth";
import { COURSE_COOKIE, assertLessonOwner, assertModuleOwner, createCourse, getTeacherCourse, listTeacherCourses } from "@/lib/course";
import { defaultData, type ModuleType, type QuizData } from "@/lib/modules";
import { createApiKey } from "@/lib/api-key";
import { cleanupFiles, regradeSubmissions, validateQuiz, writeOrder } from "@/lib/content";
import { isLessonStatus, isPlainObject, pickLessonPatch, pickModulePatch, stringArray } from "@/lib/input";

const MODULE_TYPES: ModuleType[] = ["RICHTEXT", "MEDIA", "QUIZ", "HTML"];

// ---------------- 课程 ----------------
export async function updateCourse(fd: FormData) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  await db
    .update(schema.courses)
    .set({ title: String(fd.get("title") || "我的课程"), description: String(fd.get("description") ?? "") })
    .where(eq(schema.courses.id, course.id));
  revalidatePath("/teacher", "layout");
}

async function selectCourse(courseId: string) {
  (await cookies()).set(COURSE_COOKIE, courseId, {
    httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
}

// 切换当前课程（课时、学生、批改、统计都跟着切换）
export async function switchCourse(courseId: string) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id, courseId);
  await selectCourse(course.id);
  revalidatePath("/teacher", "layout");
}

// 从首页的课程方块进入某门课：记住当前课程，再跳到它的课时页
export async function openCourse(courseId: string) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id, courseId);
  await selectCourse(course.id);
  redirect("/teacher/course");
}

export async function newCourse(title: string) {
  const t = await requireTeacher();
  const course = await createCourse(t.id, title.trim().slice(0, 100) || "新课程");
  await selectCourse(course.id);
  redirect("/teacher/course");
}

// 只允许删除空课程（没有课时、没有学生），防止误删内容和成绩
export async function deleteCourse(courseId: string) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id, courseId);
  if ((await listTeacherCourses(t.id)).length <= 1) return { error: "至少要保留一门课程" };
  const [{ n: lessons }] = await db.select({ n: count() }).from(schema.lessons).where(eq(schema.lessons.courseId, course.id));
  const [{ n: students }] = await db
    .select({ n: count() })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .where(eq(schema.classes.courseId, course.id));
  if (lessons || students) return { error: `这门课还有 ${lessons} 个课时、${students} 名学生，请先删除或移走后再删课程` };
  await db.delete(schema.courses).where(eq(schema.courses.id, course.id));
  (await cookies()).delete(COURSE_COOKIE);
  revalidatePath("/teacher", "layout");
  return { error: "" };
}

// ---------------- 课时 ----------------
export async function createLesson(fd: FormData) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  const [{ m }] = await db
    .select({ m: max(schema.lessons.order) })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, course.id));
  const [l] = await db
    .insert(schema.lessons)
    .values({ courseId: course.id, title: String(fd.get("title") || "新课时"), order: (m ?? -1) + 1 })
    .returning();
  redirect(`/teacher/lessons/${l.id}`);
}

export async function updateLesson(lessonId: string, input: { title?: string; summary?: string; section?: string }) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  // 只取这三项：否则可以顺带传 courseId、status，把课时塞进别人的课程
  const patch = pickLessonPatch(input);
  if (!Object.keys(patch).length) return;
  await db.update(schema.lessons).set(patch).where(eq(schema.lessons.id, lessonId));
  revalidatePath("/teacher", "layout");
}

export async function setLessonStatus(lessonId: string, status: "DRAFT" | "OPEN" | "SCHEDULED", openAt?: string | null) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  if (!isLessonStatus(status)) return { error: "无效的状态" };
  const at = status === "SCHEDULED" && typeof openAt === "string" && openAt ? new Date(openAt) : null;
  if (status === "SCHEDULED" && (!at || isNaN(at.getTime()))) return { error: "请选择开放时间" };
  await db.update(schema.lessons).set({ status, openAt: at }).where(eq(schema.lessons.id, lessonId));
  revalidatePath("/teacher", "layout");
  return { error: "" };
}

// 批量开放 / 设为草稿（定时开放仍在单个课时里设置）
export async function setLessonsStatus(ids: string[], status: "DRAFT" | "OPEN") {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  ids = stringArray(ids);
  if (!ids.length || (status !== "DRAFT" && status !== "OPEN")) return;
  await db
    .update(schema.lessons)
    .set({ status, openAt: null })
    .where(and(inArray(schema.lessons.id, ids), eq(schema.lessons.courseId, course.id)));
  revalidatePath("/teacher", "layout");
}

export async function deleteLesson(lessonId: string) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  await db.delete(schema.lessons).where(eq(schema.lessons.id, lessonId));
  await cleanupFiles();
  revalidatePath("/teacher", "layout");
}

export async function reorderLessons(ids: string[]) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  ids = stringArray(ids);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(schema.lessons)
        .set({ order: i })
        .where(and(eq(schema.lessons.id, ids[i]), eq(schema.lessons.courseId, course.id)));
    }
  });
  revalidatePath("/teacher", "layout");
}

export async function duplicateLesson(lessonId: string) {
  const t = await requireTeacher();
  const l = await assertLessonOwner(lessonId, t.id);
  const mods = await db.query.modules.findMany({ where: eq(schema.modules.lessonId, lessonId) });
  const [copy] = await db
    .insert(schema.lessons)
    .values({ courseId: l.courseId, title: `${l.title}（副本）`, summary: l.summary, section: l.section, order: l.order + 1 })
    .returning();
  if (mods.length)
    await db.insert(schema.modules).values(
      mods.map((m) => ({ lessonId: copy.id, order: m.order, type: m.type, title: m.title, data: m.data })),
    );
  revalidatePath("/teacher", "layout");
}

// 把课时（连同模块和学生作答）移到自己的另一门课程，排在末尾
export async function moveLesson(lessonId: string, courseId: string) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  const { course } = await getTeacherCourse(t.id, courseId);
  const [{ m }] = await db
    .select({ m: max(schema.lessons.order) })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, course.id));
  await db.update(schema.lessons).set({ courseId: course.id, order: (m ?? -1) + 1 }).where(eq(schema.lessons.id, lessonId));
  revalidatePath("/teacher", "layout");
}

// 从导出的 JSON 导入一个课时
export async function importLesson(json: string): Promise<{ id?: string; error?: string }> {
  try {
    return { id: await doImportLesson(json) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function doImportLesson(json: string) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  let parsed: { title?: string; summary?: string; section?: string; modules?: { type: ModuleType; title?: string; data: object }[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.modules)) throw new Error("文件格式不对：缺少 modules");
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const [{ m }] = await db
    .select({ m: max(schema.lessons.order) })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, course.id));
  const [l] = await db
    .insert(schema.lessons)
    .values({ courseId: course.id, title: text(parsed.title) || "导入的课时", summary: text(parsed.summary), section: text(parsed.section), order: (m ?? -1) + 1 })
    .returning();
  const mods = parsed.modules.filter((x) => isPlainObject(x) && MODULE_TYPES.includes(x.type));
  if (mods.length)
    await db.insert(schema.modules).values(
      mods.map((x, i) => ({
        lessonId: l.id, order: i, type: x.type, title: text(x.title),
        data: isPlainObject(x.data) ? x.data : (defaultData(x.type) as Record<string, unknown>),
      })),
    );
  revalidatePath("/teacher", "layout");
  return l.id;
}

// ---------------- 模块 ----------------
export async function addModule(lessonId: string, type: ModuleType, atIndex?: number) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  if (!MODULE_TYPES.includes(type)) throw new Error("无效的模块类型");
  const existing = await db.query.modules.findMany({
    where: eq(schema.modules.lessonId, lessonId),
    orderBy: (m, { asc }) => asc(m.order),
  });
  const pos = typeof atIndex === "number" && Number.isFinite(atIndex)
    ? Math.max(0, Math.min(existing.length, Math.floor(atIndex)))
    : existing.length;
  const [mod] = await db
    .insert(schema.modules)
    .values({ lessonId, type, order: pos, title: "", data: defaultData(type) as Record<string, unknown> })
    .returning();
  // 插入到中间时，后面的模块顺延
  const ids = existing.map((m) => m.id);
  ids.splice(pos, 0, mod.id);
  await writeOrder(ids);
  revalidatePath(`/teacher/lessons/${lessonId}`);
  return mod;
}

export async function updateModule(moduleId: string, input: { title?: string; data?: Record<string, unknown> }) {
  const t = await requireTeacher();
  try {
    const m = await assertModuleOwner(moduleId, t.id);
    // 只取标题和内容：否则可以顺带传 lessonId，把模块挪进别人的课时
    const patch = pickModulePatch(input);
    if (!Object.keys(patch).length) return { error: "" };
    if (m.type === "QUIZ" && patch.data) validateQuiz(patch.data as unknown as QuizData);
    await db.update(schema.modules).set(patch).where(eq(schema.modules.id, moduleId));
    if (patch.data) {
      if (m.type === "QUIZ") await regradeSubmissions(moduleId, patch.data as unknown as QuizData);
      else await cleanupFiles(); // 替换图片/视频/HTML 包后，旧文件可以清掉了
    }
    revalidatePath(`/teacher/lessons/${m.lessonId}`);
    return { error: "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteModule(moduleId: string) {
  const t = await requireTeacher();
  const m = await assertModuleOwner(moduleId, t.id);
  await db.delete(schema.modules).where(eq(schema.modules.id, moduleId));
  await cleanupFiles();
  revalidatePath(`/teacher/lessons/${m.lessonId}`);
}

export async function duplicateModule(moduleId: string) {
  const t = await requireTeacher();
  const m = await assertModuleOwner(moduleId, t.id);
  const all = await db.query.modules.findMany({
    where: eq(schema.modules.lessonId, m.lessonId),
    orderBy: (x, { asc }) => asc(x.order),
  });
  const [copy] = await db
    .insert(schema.modules)
    .values({ lessonId: m.lessonId, type: m.type, title: m.title, data: m.data, order: m.order + 1 })
    .returning();
  const ids = all.map((x) => x.id);
  ids.splice(ids.indexOf(m.id) + 1, 0, copy.id);
  await writeOrder(ids);
  revalidatePath(`/teacher/lessons/${m.lessonId}`);
}

export async function reorderModules(lessonId: string, ids: string[]) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  const own = await db.query.modules.findMany({
    where: and(eq(schema.modules.lessonId, lessonId), inArray(schema.modules.id, ids)),
  });
  if (own.length !== ids.length) throw new Error("模块不属于此课时");
  await writeOrder(ids);
  revalidatePath(`/teacher/lessons/${lessonId}`);
}

// ---------------- 学生 ----------------
export type StudentRow = { username: string; name: string; password?: string };

// 批量导入。学生的初始密码就是学号（也可以在名单里另填一列密码），不需要再分发密码。
export async function importStudents(rows: StudentRow[], classId?: string) {
  const t = await requireTeacher();
  const { cls: first } = await getTeacherCourse(t.id);
  const cls = (classId && (await myClasses(t.id)).find((c) => c.id === classId)) || first;
  const created: { username: string; name: string }[] = [];
  const skipped: { username: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const username = String(r.username ?? "").trim();
    const name = String(r.name ?? "").trim() || username;
    if (!username) continue;
    if (seen.has(username)) { skipped.push({ username, reason: "名单内重复" }); continue; }
    seen.add(username);
    const exists = await db.query.users.findFirst({ where: eq(schema.users.username, username) });
    if (exists) {
      if (exists.role === "TEACHER") { skipped.push({ username, reason: "与教师账号冲突" }); continue; }
      // 已有账号：确保在班里即可
      await db.insert(schema.enrollments).values({ userId: exists.id, classId: cls.id }).onConflictDoNothing();
      skipped.push({ username, reason: "账号已存在（已加入本课程）" });
      continue;
    }
    const password = String(r.password ?? "").trim() || username;
    const [u] = await db
      .insert(schema.users)
      .values({ username, name, role: "STUDENT", passwordHash: await hashPassword(password), mustChangePassword: false })
      .returning();
    await db.insert(schema.enrollments).values({ userId: u.id, classId: cls.id });
    created.push({ username, name });
  }
  revalidatePath("/teacher/students");
  return { created, skipped };
}

// 把某个学生的密码重置为学号。已登录的设备会被踢下线；学生用学号登录后会看到改密码提醒。
export async function resetStudentPassword(userId: string): Promise<{ error: string }> {
  const t = await requireTeacher();
  try {
    await assertStudentInMyClass(userId, t.id);
    await assertOwnsAccount(userId, t);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u) return { error: "学生不存在" };
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(u.username), mustChangePassword: false, sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId));
  return { error: "" };
}

// 把本课程所有学生的密码重置为各自的学号（学生自己改过的密码也会被覆盖）。
// 同时在其他老师课程里的学生跳过（管理员除外），返回重置人数和跳过人数。
export async function resetClassPasswords() {
  const t = await requireTeacher();
  const classIds = (await myClasses(t.id)).map((c) => c.id);
  const students = await db
    .selectDistinct({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .innerJoin(schema.enrollments, eq(schema.enrollments.userId, schema.users.id))
    .where(and(inArray(schema.enrollments.classId, classIds), eq(schema.users.role, "STUDENT")));
  const shared = t.isAdmin ? new Set<string>() : await sharedWithOtherTeachers(students.map((s) => s.id), t.id);
  let reset = 0;
  for (const s of students) {
    if (shared.has(s.id)) continue;
    await db
      .update(schema.users)
      .set({ passwordHash: await hashPassword(s.username), mustChangePassword: false, sessionVersion: sql`${schema.users.sessionVersion} + 1` })
      .where(eq(schema.users.id, s.id));
    reset++;
  }
  return { reset, skipped: shared.size };
}

export async function updateStudent(userId: string, name: string): Promise<{ error: string }> {
  const t = await requireTeacher();
  const n = String(name ?? "").trim().slice(0, 50);
  if (!n) return { error: "请输入姓名" };
  try {
    await assertStudentInMyClass(userId, t.id);
    await assertOwnsAccount(userId, t);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await db.update(schema.users).set({ name: n }).where(eq(schema.users.id, userId));
  revalidatePath("/teacher/students");
  return { error: "" };
}

// 从本课程移除学生；如果他不再上任何课程，连账号和作答记录一起删除
export async function deleteStudent(userId: string) {
  const t = await requireTeacher();
  const classIds = await assertStudentInMyClass(userId, t.id);
  await db.delete(schema.enrollments).where(and(eq(schema.enrollments.userId, userId), inArray(schema.enrollments.classId, classIds)));
  const other = await db.query.enrollments.findFirst({ where: eq(schema.enrollments.userId, userId) });
  if (!other) await db.delete(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.role, "STUDENT")));
  revalidatePath("/teacher/students");
}

// 当前课程下的所有班级
async function myClasses(teacherId: string) {
  const { course } = await getTeacherCourse(teacherId);
  return db.query.classes.findMany({ where: eq(schema.classes.courseId, course.id), orderBy: asc(schema.classes.createdAt) });
}

// 这些学生里，哪些还在别的老师的课程里
async function sharedWithOtherTeachers(userIds: string[], teacherId: string) {
  if (!userIds.length) return new Set<string>();
  const rows = await db
    .selectDistinct({ userId: schema.enrollments.userId })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.classes.courseId))
    .where(and(inArray(schema.enrollments.userId, userIds), ne(schema.courses.teacherId, teacherId)));
  return new Set(rows.map((r) => r.userId));
}

// 改密码、改名会影响学生在所有课程里的账号：只有学生只上自己的课时才允许（管理员不限）。
// 否则任何老师把别人的学生学号导入自己班，再重置密码，就能登录那个学生的账号。
async function assertOwnsAccount(userId: string, teacher: schema.User) {
  if (teacher.isAdmin) return;
  if ((await sharedWithOtherTeachers([userId], teacher.id)).size)
    throw new Error("这个学生也在其他老师的课程里，不能在这里改他的密码或姓名。请让学生自己修改，或联系管理员。");
}

async function assertStudentInMyClass(userId: string, teacherId: string) {
  const classIds = (await myClasses(teacherId)).map((c) => c.id);
  const e = await db.query.enrollments.findFirst({
    where: and(eq(schema.enrollments.userId, userId), inArray(schema.enrollments.classId, classIds)),
  });
  if (!e) throw new Error("该学生不在你的班级");
  return classIds;
}

// ---------------- 班级 ----------------
export async function createClass(name: string) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  const n = name.trim().slice(0, 30);
  if (!n) return { error: "请输入班级名称" };
  await db.insert(schema.classes).values({ name: n, courseId: course.id });
  revalidatePath("/teacher", "layout");
  return { error: "" };
}

export async function renameClass(classId: string, name: string) {
  const t = await requireTeacher();
  const c = (await myClasses(t.id)).find((x) => x.id === classId);
  const n = name.trim().slice(0, 30);
  if (!c || !n) return;
  await db.update(schema.classes).set({ name: n }).where(eq(schema.classes.id, c.id));
  revalidatePath("/teacher", "layout");
}

// 只能删空班级，且课程至少保留一个班级
export async function deleteClass(classId: string) {
  const t = await requireTeacher();
  const all = await myClasses(t.id);
  const c = all.find((x) => x.id === classId);
  if (!c) return { error: "班级不存在" };
  if (all.length <= 1) return { error: "至少保留一个班级" };
  const has = await db.query.enrollments.findFirst({ where: eq(schema.enrollments.classId, c.id) });
  if (has) return { error: "班里还有学生，请先把学生移到其他班级" };
  await db.delete(schema.classes).where(eq(schema.classes.id, c.id));
  revalidatePath("/teacher", "layout");
  return { error: "" };
}

// 把学生换到本课程的另一个班级
export async function moveStudent(userId: string, classId: string) {
  const t = await requireTeacher();
  const all = await myClasses(t.id);
  if (!all.some((c) => c.id === classId)) throw new Error("班级不存在");
  const classIds = await assertStudentInMyClass(userId, t.id);
  await db.transaction(async (tx) => {
    await tx.delete(schema.enrollments).where(and(eq(schema.enrollments.userId, userId), inArray(schema.enrollments.classId, classIds)));
    await tx.insert(schema.enrollments).values({ userId, classId });
  });
  revalidatePath("/teacher", "layout");
}

// ---------------- 批改 ----------------
export async function gradeItem(submissionId: string, questionId: string, points: number) {
  const t = await requireTeacher();
  const sub = await db.query.submissions.findFirst({ where: eq(schema.submissions.id, submissionId) });
  if (!sub) throw new Error("作答不存在");
  const m = await assertModuleOwner(sub.moduleId, t.id);
  const quiz = m.data as unknown as QuizData;
  const q = quiz.questions.find((x) => x.id === questionId);
  if (!q) throw new Error("题目不存在");
  const p = Math.max(0, Math.min(q.points, Number(points) || 0));
  const items = { ...sub.itemScores, [questionId]: p };
  const score = Object.values(items).reduce<number>((a, b) => a + (b ?? 0), 0);
  const needsGrading = Object.values(items).some((v) => v === null);
  await db.update(schema.submissions).set({ itemScores: items, score, needsGrading }).where(eq(schema.submissions.id, submissionId));
  revalidatePath("/teacher/grading");
}

// ---------------- AI 接口密钥 ----------------
export async function generateApiKey(name: string) {
  const t = await requireTeacher();
  const key = await createApiKey(t.id, name.trim().slice(0, 50) || "Claude");
  revalidatePath("/teacher/ai");
  return key;
}

export async function revokeApiKey(id: string) {
  const t = await requireTeacher();
  await db.delete(schema.apiKeys).where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.teacherId, t.id)));
  revalidatePath("/teacher/ai");
}

