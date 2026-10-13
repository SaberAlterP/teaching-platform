import "server-only";
import { and, asc, count, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { lessonVisible } from "@/lib/course";
import { summarize, type CourseShape, type StudentStat } from "@/lib/report";

// 课程统计报告的数据（仅管理员页面使用）。
// 服务器内存小：所有统计都在数据库里按课程 / 按学生汇总好再取出来，不把作答、进度明细读进内存。

const m = schema.modules;
const l = schema.lessons;

// 计分项：习题，或打开了“接收成绩”的互动内容
const isScored = sql`(${m.type} = 'QUIZ' or (${m.type} = 'HTML' and ${m.data}->'scored' = 'true'::jsonb))`;
// 每个模块的满分（和成绩统计页的口径一致：习题 = 各题分值之和，计分互动内容 = maxScore，默认 100）
const maxScore = sql`(case
  when ${m.type} = 'QUIZ' then (
    select coalesce(sum(case when jsonb_typeof(q->'points') = 'number' then (q->>'points')::real else 0 end), 0)
    from jsonb_array_elements(case when jsonb_typeof(${m.data}->'questions') = 'array' then ${m.data}->'questions' else '[]'::jsonb end) q
  )
  when ${m.type} = 'HTML' and ${m.data}->'scored' = 'true'::jsonb then
    (case when jsonb_typeof(${m.data}->'maxScore') = 'number' then (${m.data}->>'maxScore')::real else 100 end)
  else 0 end)`;
const questionCount = sql`(case when ${m.type} = 'QUIZ' and jsonb_typeof(${m.data}->'questions') = 'array' then jsonb_array_length(${m.data}->'questions') else 0 end)`;
const countIf = (cond: SQL) => sql<number>`coalesce(sum(case when ${cond} then 1 else 0 end), 0)::int`;

const byCourse = (courseId?: string) => (courseId ? eq(l.courseId, courseId) : undefined);
// 课时是否已对学生开放（作为一个可以放进 select / case 的表达式）
const visibleExpr = () => sql`(${lessonVisible()})`;

export type ModuleStats = {
  courseId: string;
  tasks: number;
  scoredItems: number;
  totalMax: number;
  questions: number;
  richtext: number;
  image: number;
  video: number;
  quiz: number;
  html: number;
};

// 各课程的内容数量。visibleOnly = 只算学生看得到的课时（学习统计用）；否则包括草稿（资源统计用）
async function moduleStats(courseId: string | undefined, visibleOnly: boolean): Promise<ModuleStats[]> {
  return db
    .select({
      courseId: l.courseId,
      tasks: sql<number>`count(*)::int`,
      scoredItems: countIf(isScored),
      totalMax: sql<number>`coalesce(sum(${maxScore}), 0)::real`,
      questions: sql<number>`coalesce(sum(${questionCount}), 0)::int`,
      richtext: countIf(sql`${m.type} = 'RICHTEXT'`),
      image: countIf(sql`${m.type} = 'MEDIA' and coalesce(${m.data}->>'kind', 'image') <> 'video'`),
      video: countIf(sql`${m.type} = 'MEDIA' and ${m.data}->>'kind' = 'video'`),
      quiz: countIf(sql`${m.type} = 'QUIZ'`),
      html: countIf(sql`${m.type} = 'HTML'`),
    })
    .from(m)
    .innerJoin(l, eq(l.id, m.lessonId))
    .where(and(byCourse(courseId), visibleOnly ? lessonVisible() : undefined))
    .groupBy(l.courseId);
}

export type StudentRow = { courseId: string; classId: string; userId: string; stat: StudentStat };

// 每门课每个学生的学习数据（只算已开放课时）。一个学生在同一门课的多个班里时只算第一个班
async function studentStats(courseId?: string): Promise<StudentRow[]> {
  const e = schema.enrollments;
  const c = schema.classes;
  const mp = schema.moduleProgress;
  const s = schema.submissions;
  const [enrolled, progress, subs] = await Promise.all([
    db
      .select({ courseId: c.courseId, classId: e.classId, userId: e.userId })
      .from(e)
      .innerJoin(c, eq(c.id, e.classId))
      .innerJoin(schema.users, eq(schema.users.id, e.userId))
      .where(and(eq(schema.users.role, "STUDENT"), courseId ? eq(c.courseId, courseId) : undefined))
      .orderBy(asc(c.createdAt)),
    db
      .select({ courseId: l.courseId, userId: mp.userId, done: sql<number>`count(*)::int`, last: sql<Date | null>`max(${mp.completedAt})` })
      .from(mp)
      .innerJoin(m, eq(m.id, mp.moduleId))
      .innerJoin(l, eq(l.id, m.lessonId))
      .where(and(byCourse(courseId), lessonVisible()))
      .groupBy(l.courseId, mp.userId),
    db
      .select({
        courseId: l.courseId,
        userId: s.userId,
        subs: sql<number>`count(*)::int`,
        got: sql<number>`coalesce(sum(${s.score}), 0)::real`,
        full: sql<number>`coalesce(sum(${s.maxScore}), 0)::real`,
        pending: countIf(sql`${s.needsGrading}`),
        last: sql<Date | null>`max(${s.updatedAt})`,
      })
      .from(s)
      .innerJoin(m, eq(m.id, s.moduleId))
      .innerJoin(l, eq(l.id, m.lessonId))
      .where(and(byCourse(courseId), lessonVisible(), isScored))
      .groupBy(l.courseId, s.userId),
  ]);
  const key = (a: string, b: string) => `${a}:${b}`;
  const pm = new Map(progress.map((r) => [key(r.courseId, r.userId), r]));
  const sm = new Map(subs.map((r) => [key(r.courseId, r.userId), r]));
  const seen = new Set<string>();
  const out: StudentRow[] = [];
  for (const r of enrolled) {
    const k = key(r.courseId, r.userId);
    if (seen.has(k)) continue;
    seen.add(k);
    const p = pm.get(k);
    const q = sm.get(k);
    const pl = p?.last ? new Date(p.last) : null;
    const ql = q?.last ? new Date(q.last) : null;
    out.push({
      ...r,
      stat: {
        done: p?.done ?? 0,
        subs: q?.subs ?? 0,
        got: q?.got ?? 0,
        full: q?.full ?? 0,
        pending: q?.pending ?? 0,
        last: !pl ? ql : !ql ? pl : pl > ql ? pl : ql,
      },
    });
  }
  return out;
}

// 近 weeks 周每周的学习记录：完成任务点次数、作答次数（按北京时间，周一开始）
async function weekly(courseId: string | undefined, weeks: number) {
  const since = new Date(Date.now() - weeks * 7 * 86400_000);
  const week = (col: SQL) => sql<string>`to_char(date_trunc('week', ${col} at time zone 'Asia/Shanghai'), 'YYYY-MM-DD')`;
  const pw = week(sql`${schema.moduleProgress.completedAt}`);
  const sw = week(sql`${schema.submissions.updatedAt}`);
  const [p, s] = await Promise.all([
    db
      .select({ week: pw, n: sql<number>`count(*)::int` })
      .from(schema.moduleProgress)
      .innerJoin(m, eq(m.id, schema.moduleProgress.moduleId))
      .innerJoin(l, eq(l.id, m.lessonId))
      .where(and(byCourse(courseId), gte(schema.moduleProgress.completedAt, since)))
      .groupBy(pw),
    db
      .select({ week: sw, n: sql<number>`count(*)::int` })
      .from(schema.submissions)
      .innerJoin(m, eq(m.id, schema.submissions.moduleId))
      .innerJoin(l, eq(l.id, m.lessonId))
      .where(and(byCourse(courseId), gte(schema.submissions.updatedAt, since)))
      .groupBy(sw),
  ]);
  const map = new Map<string, { week: string; progress: number; subs: number }>();
  for (const r of p) map.set(r.week, { week: r.week, progress: r.n, subs: 0 });
  for (const r of s) map.set(r.week, { ...(map.get(r.week) ?? { week: r.week, progress: 0 }), subs: r.n });
  return [...map.values()];
}

const zeroModules = (courseId: string): ModuleStats => ({
  courseId, tasks: 0, scoredItems: 0, totalMax: 0, questions: 0, richtext: 0, image: 0, video: 0, quiz: 0, html: 0,
});
const shapeOf = (ms: ModuleStats): CourseShape => ({ tasks: ms.tasks, scoredItems: ms.scoredItems, totalMax: ms.totalMax });

// ---- 全平台：每门课一行 ----
export async function loadPlatformReport() {
  const c = schema.courses;
  const [courses, classCounts, lessonCounts, annCounts, allMods, openMods, students, weeks] = await Promise.all([
    db
      .select({ id: c.id, title: c.title, createdAt: c.createdAt, teacher: schema.users.name, teacherUsername: schema.users.username })
      .from(c)
      .innerJoin(schema.users, eq(schema.users.id, c.teacherId))
      .orderBy(asc(c.createdAt)),
    db.select({ courseId: schema.classes.courseId, n: count() }).from(schema.classes).groupBy(schema.classes.courseId),
    db
      .select({ courseId: l.courseId, n: count(), open: countIf(visibleExpr()) })
      .from(l)
      .groupBy(l.courseId),
    db.select({ courseId: schema.announcements.courseId, n: count() }).from(schema.announcements).groupBy(schema.announcements.courseId),
    moduleStats(undefined, false),
    moduleStats(undefined, true),
    studentStats(),
    weekly(undefined, 12),
  ]);
  const cc = new Map(classCounts.map((r) => [r.courseId, r.n]));
  const lc = new Map(lessonCounts.map((r) => [r.courseId, r]));
  const ac = new Map(annCounts.map((r) => [r.courseId, r.n]));
  const am = new Map(allMods.map((r) => [r.courseId, r]));
  const om = new Map(openMods.map((r) => [r.courseId, r]));
  const sb = new Map<string, StudentStat[]>();
  for (const r of students) sb.set(r.courseId, [...(sb.get(r.courseId) ?? []), r.stat]);

  const rows = courses.map((co) => {
    const open = om.get(co.id) ?? zeroModules(co.id);
    return {
      ...co,
      classes: cc.get(co.id) ?? 0,
      lessons: lc.get(co.id)?.n ?? 0,
      openLessons: lc.get(co.id)?.open ?? 0,
      announcements: ac.get(co.id) ?? 0,
      content: am.get(co.id) ?? zeroModules(co.id),
      open,
      summary: summarize(sb.get(co.id) ?? [], shapeOf(open)),
    };
  });
  // 一个学生可能选了多门课：平台总人数按人去重
  const uniqueStudents = new Set(students.map((r) => r.userId)).size;
  const teachers = new Set(courses.map((r) => r.teacherUsername)).size;
  return { rows, weeks, uniqueStudents, teachers };
}

// ---- 单门课程的报告 ----
export async function loadCourseReport(courseId: string) {
  const [course] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      description: schema.courses.description,
      createdAt: schema.courses.createdAt,
      teacher: schema.users.name,
      teacherUsername: schema.users.username,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.teacherId))
    .where(eq(schema.courses.id, courseId));
  if (!course) return null;

  const enrolledIds = db
    .select({ id: schema.enrollments.userId })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .where(eq(schema.classes.courseId, courseId));

  const [classes, lessons, [ann], allMods, openMods, students, weeks, perLessonMods, perLessonDone, qtypes] = await Promise.all([
    db
      .select({ id: schema.classes.id, name: schema.classes.name, createdAt: schema.classes.createdAt })
      .from(schema.classes)
      .where(eq(schema.classes.courseId, courseId))
      .orderBy(asc(schema.classes.createdAt)),
    db
      .select({ id: l.id, title: l.title, section: l.section, status: l.status, openAt: l.openAt, visible: sql<boolean>`${visibleExpr()}` })
      .from(l)
      .where(eq(l.courseId, courseId))
      .orderBy(asc(l.order), asc(l.createdAt)),
    db.select({ n: count() }).from(schema.announcements).where(eq(schema.announcements.courseId, courseId)),
    moduleStats(courseId, false),
    moduleStats(courseId, true),
    studentStats(courseId),
    weekly(courseId, 12),
    db
      .select({ lessonId: m.lessonId, n: count() })
      .from(m)
      .innerJoin(l, eq(l.id, m.lessonId))
      .where(eq(l.courseId, courseId))
      .groupBy(m.lessonId),
    // 每个课时被现在班里的学生完成了多少次（退课学生的旧进度不算）
    db
      .select({ lessonId: m.lessonId, n: count() })
      .from(schema.moduleProgress)
      .innerJoin(m, eq(m.id, schema.moduleProgress.moduleId))
      .innerJoin(l, eq(l.id, m.lessonId))
      .where(and(eq(l.courseId, courseId), inArray(schema.moduleProgress.userId, enrolledIds)))
      .groupBy(m.lessonId),
    // 各题型的题目数（包括草稿课时里的）
    db.execute<{ type: string; n: number }>(sql`
      select q->>'type' as type, count(*)::int as n
      from ${m} join ${l} on ${l.id} = ${m.lessonId}
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(${m.data}->'questions') = 'array' then ${m.data}->'questions' else '[]'::jsonb end
      ) q
      where ${l.courseId} = ${courseId} and ${m.type} = 'QUIZ'
      group by 1`),
  ]);

  const open = openMods[0] ?? zeroModules(courseId);
  const shape = shapeOf(open);
  const byClass = classes.map((cl) => ({
    ...cl,
    summary: summarize(students.filter((s) => s.classId === cl.id).map((s) => s.stat), shape),
  }));
  const lm = new Map(perLessonMods.map((r) => [r.lessonId, r.n]));
  const ld = new Map(perLessonDone.map((r) => [r.lessonId, r.n]));
  const studentCount = students.length;
  const lessonCompletion = lessons
    .map((x, i) => ({ ...x, no: i + 1 }))
    .filter((x) => x.visible)
    .map((x) => {
      const denom = (lm.get(x.id) ?? 0) * studentCount;
      return { name: `第${x.no}课`, title: x.title, rate: denom ? Math.round(Math.min(1, (ld.get(x.id) ?? 0) / denom) * 100) : 0 };
    });

  return {
    course,
    classes: byClass,
    lessons,
    announcements: ann?.n ?? 0,
    content: allMods[0] ?? zeroModules(courseId),
    open,
    summary: summarize(students.map((s) => s.stat), shape),
    weeks,
    lessonCompletion,
    questionTypes: qtypes.rows,
  };
}
