import "server-only";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const u = schema.aiUsageLog;

export type Totals = { calls: number; prompt: number; completion: number; cached: number };
const sums = {
  calls: sql<number>`count(*)::int`,
  prompt: sql<number>`coalesce(sum(${u.promptTokens}),0)::int`,
  completion: sql<number>`coalesce(sum(${u.completionTokens}),0)::int`,
  cached: sql<number>`coalesce(sum(${u.cachedTokens}),0)::int`,
};

// 近 days 天（days=0 表示全部）的用量：总计、每位老师、按日
export async function loadUsage(days: number) {
  const since = days > 0 ? new Date(Date.now() - days * 86400_000) : null;
  const where = since ? gte(u.createdAt, since) : undefined;
  const day = sql<string>`to_char(${u.createdAt} at time zone 'Asia/Shanghai', 'YYYY-MM-DD')`;

  const [perTeacher, perDay, teachers, chatCounts] = await Promise.all([
    db.select({ teacherId: u.teacherId, ...sums, last: sql<Date>`max(${u.createdAt})` }).from(u).where(where).groupBy(u.teacherId),
    db.select({ day, ...sums }).from(u).where(where).groupBy(day).orderBy(desc(day)),
    db
      .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username, isAdmin: schema.users.isAdmin })
      .from(schema.users)
      .where(eq(schema.users.role, "TEACHER")),
    db.select({ teacherId: schema.aiChats.teacherId, n: count() }).from(schema.aiChats).groupBy(schema.aiChats.teacherId),
  ]);
  const usageBy = new Map(perTeacher.map((r) => [r.teacherId, r]));
  const chatsBy = new Map(chatCounts.map((r) => [r.teacherId, r.n]));
  const rows = teachers
    .map((t) => {
      const r = usageBy.get(t.id);
      return { ...t, calls: r?.calls ?? 0, prompt: r?.prompt ?? 0, completion: r?.completion ?? 0, cached: r?.cached ?? 0, last: r?.last ?? null, chats: chatsBy.get(t.id) ?? 0 };
    })
    .sort((a, b) => b.prompt + b.completion - (a.prompt + a.completion));
  const total: Totals = rows.reduce(
    (a, r) => ({ calls: a.calls + r.calls, prompt: a.prompt + r.prompt, completion: a.completion + r.completion, cached: a.cached + r.cached }),
    { calls: 0, prompt: 0, completion: 0, cached: 0 },
  );
  return { rows, perDay, total };
}

export async function loadTeacherOverview() {
  const [teachers, courses, lessons] = await Promise.all([
    db
      .select({
        id: schema.users.id, name: schema.users.name, username: schema.users.username,
        isAdmin: schema.users.isAdmin, createdAt: schema.users.createdAt, lastLoginAt: schema.users.lastLoginAt,
      })
      .from(schema.users)
      .where(eq(schema.users.role, "TEACHER"))
      .orderBy(schema.users.createdAt),
    db.select({ teacherId: schema.courses.teacherId, n: count() }).from(schema.courses).groupBy(schema.courses.teacherId),
    db
      .select({ teacherId: schema.courses.teacherId, n: count() })
      .from(schema.lessons)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
      .groupBy(schema.courses.teacherId),
  ]);
  const cm = new Map(courses.map((r) => [r.teacherId, r.n]));
  const lm = new Map(lessons.map((r) => [r.teacherId, r.n]));
  return teachers.map((t) => ({ ...t, courses: cm.get(t.id) ?? 0, lessons: lm.get(t.id) ?? 0 }));
}


