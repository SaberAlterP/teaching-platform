"use server";
import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, requireTeacher } from "@/lib/auth";
import { assertLessonOwner, assertModuleOwner, getTeacherCourse } from "@/lib/course";
import { defaultData, type ModuleType, type QuizData } from "@/lib/modules";

// ---------------- 课程 ----------------
export async function updateCourse(fd: FormData) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  await db
    .update(schema.courses)
    .set({ title: String(fd.get("title") || "我的课程"), description: String(fd.get("description") ?? "") })
    .where(eq(schema.courses.id, course.id));
  revalidatePath("/teacher");
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

export async function updateLesson(lessonId: string, patch: { title?: string; summary?: string }) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  await db.update(schema.lessons).set(patch).where(eq(schema.lessons.id, lessonId));
  revalidatePath("/teacher", "layout");
}

export async function setLessonStatus(lessonId: string, status: "DRAFT" | "OPEN" | "SCHEDULED", openAt?: string | null) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  const at = status === "SCHEDULED" && openAt ? new Date(openAt) : null;
  if (status === "SCHEDULED" && (!at || isNaN(at.getTime()))) return { error: "请选择开放时间" };
  await db.update(schema.lessons).set({ status, openAt: at }).where(eq(schema.lessons.id, lessonId));
  revalidatePath("/teacher", "layout");
  return { error: "" };
}

export async function deleteLesson(lessonId: string) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  await db.delete(schema.lessons).where(eq(schema.lessons.id, lessonId));
  revalidatePath("/teacher");
}

export async function reorderLessons(ids: string[]) {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(schema.lessons)
        .set({ order: i })
        .where(and(eq(schema.lessons.id, ids[i]), eq(schema.lessons.courseId, course.id)));
    }
  });
  revalidatePath("/teacher");
}

export async function duplicateLesson(lessonId: string) {
  const t = await requireTeacher();
  const l = await assertLessonOwner(lessonId, t.id);
  const mods = await db.query.modules.findMany({ where: eq(schema.modules.lessonId, lessonId) });
  const [copy] = await db
    .insert(schema.lessons)
    .values({ courseId: l.courseId, title: `${l.title}（副本）`, summary: l.summary, order: l.order + 1 })
    .returning();
  if (mods.length)
    await db.insert(schema.modules).values(
      mods.map((m) => ({ lessonId: copy.id, order: m.order, type: m.type, title: m.title, data: m.data })),
    );
  revalidatePath("/teacher");
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
  let parsed: { title?: string; summary?: string; modules?: { type: ModuleType; title?: string; data: object }[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (!Array.isArray(parsed.modules)) throw new Error("文件格式不对：缺少 modules");
  const valid: ModuleType[] = ["RICHTEXT", "MEDIA", "QUIZ", "HTML"];
  const [{ m }] = await db
    .select({ m: max(schema.lessons.order) })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, course.id));
  const [l] = await db
    .insert(schema.lessons)
    .values({ courseId: course.id, title: parsed.title || "导入的课时", summary: parsed.summary ?? "", order: (m ?? -1) + 1 })
    .returning();
  const mods = parsed.modules.filter((x) => valid.includes(x.type));
  if (mods.length)
    await db.insert(schema.modules).values(
      mods.map((x, i) => ({
        lessonId: l.id, order: i, type: x.type, title: x.title ?? "", data: x.data as Record<string, unknown>,
      })),
    );
  revalidatePath("/teacher");
  return l.id;
}

// ---------------- 模块 ----------------
export async function addModule(lessonId: string, type: ModuleType, atIndex?: number) {
  const t = await requireTeacher();
  await assertLessonOwner(lessonId, t.id);
  const existing = await db.query.modules.findMany({
    where: eq(schema.modules.lessonId, lessonId),
    orderBy: (m, { asc }) => asc(m.order),
  });
  const pos = atIndex ?? existing.length;
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

export async function updateModule(moduleId: string, patch: { title?: string; data?: Record<string, unknown> }) {
  const t = await requireTeacher();
  try {
    const m = await assertModuleOwner(moduleId, t.id);
    if (m.type === "QUIZ" && patch.data) validateQuiz(patch.data as unknown as QuizData);
    await db.update(schema.modules).set(patch).where(eq(schema.modules.id, moduleId));
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

async function writeOrder(ids: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++)
      await tx.update(schema.modules).set({ order: i }).where(eq(schema.modules.id, ids[i]));
  });
}

function validateQuiz(q: QuizData) {
  if (!Array.isArray(q.questions)) throw new Error("习题数据格式错误");
  for (const [i, x] of q.questions.entries()) {
    if (!x.prompt?.trim()) throw new Error(`第 ${i + 1} 题缺少题干`);
    if ((x.type === "single" || x.type === "multi") && (!x.options || x.options.length < 2))
      throw new Error(`第 ${i + 1} 题至少需要两个选项`);
    if (x.type === "single" && typeof x.answer !== "number") throw new Error(`第 ${i + 1} 题请设置正确答案`);
    if (x.type === "multi" && (!Array.isArray(x.answer) || !x.answer.length)) throw new Error(`第 ${i + 1} 题请设置正确答案`);
    if (x.type === "fill" && (!Array.isArray(x.answer) || !x.answer.some((a) => String(a).trim())))
      throw new Error(`第 ${i + 1} 题请填写参考答案`);
  }
}

// ---------------- 学生 ----------------
export type StudentRow = { username: string; name: string; password?: string };

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => chars[randomInt(chars.length)]).join("");
}

// 批量导入。返回每个新账号的初始密码，老师下载后分发给学生。
export async function importStudents(rows: StudentRow[]) {
  const t = await requireTeacher();
  const { cls } = await getTeacherCourse(t.id);
  const created: { username: string; name: string; password: string }[] = [];
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
      skipped.push({ username, reason: "账号已存在（已加入班级）" });
      continue;
    }
    const password = String(r.password ?? "").trim() || randomPassword();
    const [u] = await db
      .insert(schema.users)
      .values({ username, name, role: "STUDENT", passwordHash: await hashPassword(password) })
      .returning();
    await db.insert(schema.enrollments).values({ userId: u.id, classId: cls.id });
    created.push({ username, name, password });
  }
  revalidatePath("/teacher/students");
  return { created, skipped };
}

export async function resetStudentPassword(userId: string) {
  const t = await requireTeacher();
  await assertStudentInMyClass(userId, t.id);
  const password = randomPassword();
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
    .where(eq(schema.users.id, userId));
  return password;
}

export async function updateStudent(userId: string, name: string) {
  const t = await requireTeacher();
  await assertStudentInMyClass(userId, t.id);
  await db.update(schema.users).set({ name: name.trim() }).where(eq(schema.users.id, userId));
  revalidatePath("/teacher/students");
}

export async function deleteStudent(userId: string) {
  const t = await requireTeacher();
  await assertStudentInMyClass(userId, t.id);
  await db.delete(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.role, "STUDENT")));
  revalidatePath("/teacher/students");
}

async function assertStudentInMyClass(userId: string, teacherId: string) {
  const { cls } = await getTeacherCourse(teacherId);
  const e = await db.query.enrollments.findFirst({
    where: and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.classId, cls.id)),
  });
  if (!e) throw new Error("该学生不在你的班级");
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
