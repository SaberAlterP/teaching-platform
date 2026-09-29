import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanupFiles, regradeSubmissions, writeOrder } from "@/lib/content";
import type { QuizData } from "@/lib/modules";
import { UNDO_DAYS } from "@/lib/storage";

// 撤销 AI 助手的一次改动。只有目标还保持 AI 改完时的样子才允许撤销，
// 避免把老师（或 AI）之后做的修改冲掉。

// 数据库 jsonb 会重排对象的键，比较前按键名排序
const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
  : v;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

export async function undoChange(teacherId: string, changeId: string) {
  const [row] = await db
    .select({ c: schema.aiChanges })
    .from(schema.aiChanges)
    .innerJoin(schema.aiChats, eq(schema.aiChats.id, schema.aiChanges.chatId))
    .where(and(eq(schema.aiChanges.id, changeId), eq(schema.aiChats.teacherId, teacherId)));
  if (!row) throw new Error("改动记录不存在");
  const c = row.c;
  if (c.undone) throw new Error("已经撤销过了");
  if (Date.now() - c.createdAt.getTime() > UNDO_DAYS * 86400_000) throw new Error(`超过 ${UNDO_DAYS} 天的改动不能撤销`);
  const before = c.before ?? {};
  const after = c.after ?? {};
  const changed = () => new Error("这之后内容又被修改过，不能直接撤销。请先撤销后面的改动，或手动修改");

  switch (c.kind) {
    case "module.update": {
      const m = await db.query.modules.findFirst({ where: eq(schema.modules.id, c.targetId) });
      if (!m) throw new Error("模块已被删除");
      if (!same(m.data, after.data) || m.title !== after.title) throw changed();
      await db.update(schema.modules).set({ title: before.title as string, data: before.data as Record<string, unknown> }).where(eq(schema.modules.id, m.id));
      if (m.type === "QUIZ") await regradeSubmissions(m.id, before.data as unknown as QuizData);
      else await cleanupFiles();
      break;
    }
    case "module.create": {
      const m = await db.query.modules.findFirst({ where: eq(schema.modules.id, c.targetId) });
      if (m) {
        if (!same(m.data, after.data) || m.title !== after.title) throw changed();
        await db.delete(schema.modules).where(eq(schema.modules.id, m.id));
        await cleanupFiles();
      }
      break;
    }
    case "module.delete": {
      const lessonId = before.lessonId as string;
      const l = await db.query.lessons.findFirst({ where: eq(schema.lessons.id, lessonId) });
      if (!l) throw new Error("所在课时已被删除");
      const exists = await db.query.modules.findFirst({ where: eq(schema.modules.id, c.targetId) });
      if (!exists) {
        await db.insert(schema.modules).values({
          id: c.targetId, lessonId, type: before.type as schema.Module["type"], title: before.title as string,
          data: before.data as Record<string, unknown>, order: 9999,
        });
        const list = (await db.query.modules.findMany({ where: eq(schema.modules.lessonId, lessonId), orderBy: asc(schema.modules.order) }))
          .map((x) => x.id)
          .filter((x) => x !== c.targetId);
        list.splice(Math.max(0, Math.min(list.length, Number(before.index) || 0)), 0, c.targetId);
        await writeOrder(list);
      }
      break;
    }
    case "module.reorder": {
      const cur = (await db.query.modules.findMany({ where: eq(schema.modules.lessonId, c.targetId), orderBy: asc(schema.modules.order) })).map((x) => x.id);
      if (!same(cur, after.ids)) throw changed();
      await writeOrder(before.ids as string[]);
      break;
    }
    case "lesson.create": {
      const l = await db.query.lessons.findFirst({ where: eq(schema.lessons.id, c.targetId) });
      if (l) {
        await db.delete(schema.lessons).where(eq(schema.lessons.id, l.id));
        await cleanupFiles();
      }
      break;
    }
    case "lesson.update": {
      const l = await db.query.lessons.findFirst({ where: eq(schema.lessons.id, c.targetId) });
      if (!l) throw new Error("课时已被删除");
      const now = { title: l.title, summary: l.summary, section: l.section, status: l.status, openAt: l.openAt?.toISOString() ?? null };
      if (!same(now, after)) throw changed();
      await db
        .update(schema.lessons)
        .set({
          title: before.title as string, summary: before.summary as string, section: before.section as string,
          status: before.status as schema.Lesson["status"], openAt: before.openAt ? new Date(before.openAt as string) : null,
        })
        .where(eq(schema.lessons.id, l.id));
      break;
    }
    case "lesson.reorder": {
      const ls = await db.query.lessons.findMany({ where: eq(schema.lessons.courseId, c.targetId), orderBy: [asc(schema.lessons.order), asc(schema.lessons.createdAt)] });
      if (!same(ls.map((x) => x.id), after.ids)) throw changed();
      const ids = before.ids as string[];
      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) await tx.update(schema.lessons).set({ order: i }).where(eq(schema.lessons.id, ids[i]));
      });
      break;
    }
    case "course.update": {
      const co = await db.query.courses.findFirst({ where: eq(schema.courses.id, c.targetId) });
      if (!co) throw new Error("课程已被删除");
      if (co.title !== after.title || co.description !== after.description) throw changed();
      await db.update(schema.courses).set({ title: before.title as string, description: before.description as string }).where(eq(schema.courses.id, co.id));
      break;
    }
    case "course.create": {
      const co = await db.query.courses.findFirst({ where: eq(schema.courses.id, c.targetId) });
      if (co) {
        const [{ n }] = await db
          .select({ n: count() })
          .from(schema.enrollments)
          .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
          .where(eq(schema.classes.courseId, co.id));
        if (n) throw new Error("这门课已经有学生，不能撤销，请在课程页手动处理");
        const [{ total }] = await db.select({ total: count() }).from(schema.courses).where(eq(schema.courses.teacherId, teacherId));
        if (total <= 1) throw new Error("这是你唯一的课程，不能撤销");
        await db.delete(schema.courses).where(eq(schema.courses.id, co.id));
        await cleanupFiles();
      }
      break;
    }
    default:
      throw new Error("这种改动不支持撤销");
  }
  await db.update(schema.aiChanges).set({ undone: true }).where(eq(schema.aiChanges.id, c.id));
  // 下一条消息时告诉 AI，免得它以为内容还在
  await db
    .update(schema.aiChats)
    .set({ notes: [...((await db.query.aiChats.findFirst({ where: eq(schema.aiChats.id, c.chatId) }))?.notes ?? []), `老师撤销了：${c.label}`] })
    .where(eq(schema.aiChats.id, c.chatId));
  return c;
}

// 撤销说明（界面上确认框用）
export function undoWarning(kind: string) {
  if (kind === "lesson.create") return "会删除这个课时（包括之后在里面做的所有修改和学生作答）。";
  if (kind === "course.create") return "会删除这门课程和里面的全部课时。";
  if (kind === "module.create") return "会删除这个模块（包括学生在里面的作答）。";
  if (kind === "module.delete") return "会恢复这个模块，但学生原来的作答已经无法恢复。";
  return "";
}
