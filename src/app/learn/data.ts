import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { studentCourseIds, visibleLessonsFor } from "@/lib/course";
import type { HtmlData, QuizData } from "@/lib/modules";
import type { TileInfo } from "./LessonTile";

// 学生首页和课程页共用：学生所在的课程，以及每个已开放课时的进度、得分
export async function loadLearnData(userId: string) {
  const lessons = await visibleLessonsFor(userId);
  // 只显示至少有一个已开放课时的课程：老师还没开放的课程（含空白占位课）学生看不到
  const openCourseIds = new Set(lessons.map((l) => l.courseId));
  const courseIds = (await studentCourseIds(userId)).filter((id) => openCourseIds.has(id));
  const ids = lessons.map((l) => l.id);
  // 这几组查询互不依赖，同时发出，页面等待时间 = 最慢的那一个
  const [courses, mods, done, scoredMods, subs] = await Promise.all([
    courseIds.length
      ? db.select().from(schema.courses).where(inArray(schema.courses.id, courseIds)).orderBy(asc(schema.courses.createdAt))
      : [],
    ids.length
      ? db.select({ id: schema.modules.id, lessonId: schema.modules.lessonId, type: schema.modules.type }).from(schema.modules).where(inArray(schema.modules.lessonId, ids))
      : [],
    ids.length
      ? db
          .select({ id: schema.moduleProgress.moduleId, lessonId: schema.modules.lessonId, at: schema.moduleProgress.completedAt })
          .from(schema.moduleProgress)
          .innerJoin(schema.modules, eq(schema.modules.id, schema.moduleProgress.moduleId))
          .where(and(eq(schema.moduleProgress.userId, userId), inArray(schema.modules.lessonId, ids)))
      : [],
    // 计分项（习题、可计分的互动内容）：只取需要算满分的数据，避免把图文正文都读出来
    ids.length
      ? db
          .select({ id: schema.modules.id, lessonId: schema.modules.lessonId, type: schema.modules.type, data: schema.modules.data })
          .from(schema.modules)
          .where(and(inArray(schema.modules.lessonId, ids), inArray(schema.modules.type, ["QUIZ", "HTML"])))
      : [],
    ids.length
      ? db
          .select({ moduleId: schema.submissions.moduleId, score: schema.submissions.score, lessonId: schema.modules.lessonId, at: schema.submissions.updatedAt })
          .from(schema.submissions)
          .innerJoin(schema.modules, eq(schema.modules.id, schema.submissions.moduleId))
          .where(and(eq(schema.submissions.userId, userId), inArray(schema.modules.lessonId, ids)))
      : [],
  ]);
  const doneSet = new Set(done.map((d) => d.id));
  const scoredList = scoredMods
    .map((m) => ({
      id: m.id,
      lessonId: m.lessonId,
      max: m.type === "QUIZ"
        ? (m.data as unknown as QuizData).questions.reduce((a, q) => a + q.points, 0)
        : (m.data as unknown as HtmlData).scored ? ((m.data as unknown as HtmlData).maxScore ?? 100) : 0,
    }))
    .filter((m) => m.max > 0);
  const subScore = new Map(subs.map((s) => [s.moduleId, s.score]));

  // 按课程排列，这样“继续学习”先走完第一门课
  const courseRank = new Map(courses.map((c, i) => [c.id, i]));
  const ordered = [...lessons].sort((a, b) => (courseRank.get(a.courseId) ?? 0) - (courseRank.get(b.courseId) ?? 0));
  // 每个课时最近一次学习时间（学完一个环节或提交成绩），用于“最近在学”
  const lastAt = new Map<string, number>();
  for (const r of [...done, ...subs]) lastAt.set(r.lessonId, Math.max(lastAt.get(r.lessonId) ?? 0, r.at.getTime()));
  const stats = ordered.map((l) => {
    const lm = mods.filter((m) => m.lessonId === l.id);
    const d = lm.filter((m) => doneSet.has(m.id)).length;
    const sm = scoredList.filter((m) => m.lessonId === l.id);
    const got = sm.filter((m) => subScore.has(m.id));
    const tile: TileInfo = {
      id: l.id,
      title: l.title,
      summary: l.summary,
      done: d,
      total: lm.length,
      pct: lm.length ? Math.round((d / lm.length) * 100) : 0,
      hasHtml: lm.some((m) => m.type === "HTML"),
      hasQuiz: lm.some((m) => m.type === "QUIZ"),
      hasText: lm.some((m) => m.type === "RICHTEXT" || m.type === "MEDIA"),
      score: got.length ? got.reduce((a, m) => a + (subScore.get(m.id) ?? 0), 0) : null,
      maxScore: sm.reduce((a, m) => a + m.max, 0),
    };
    return { lesson: l, tile, pct: tile.pct, lastAt: lastAt.get(l.id) ?? 0 };
  });
  const lessonsDone = stats.filter((s) => s.pct === 100).length;
  const allDone = stats.reduce((a, s) => a + s.tile.done, 0);
  const allTotal = stats.reduce((a, s) => a + s.tile.total, 0);
  const overall = allTotal ? Math.round((allDone / allTotal) * 100) : 0;
  const next = stats.find((s) => s.pct < 100);
  // 累计得分率、连续学习天数（按北京时间的日期算，今天还没学也不断，从昨天往前数）
  const got = stats.reduce((a, s) => a + (s.tile.score ?? 0), 0);
  const max = stats.filter((s) => s.tile.score !== null).reduce((a, s) => a + s.tile.maxScore, 0);
  const day = (t: number) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
  const days = new Set([...done, ...subs].map((r) => day(r.at.getTime())));
  let streak = 0;
  const now = Date.now();
  for (let t = now; ; t -= 86400_000) {
    if (days.has(day(t))) streak++;
    else if (t < now) break;
  }
  const recent = stats.filter((s) => s.lastAt).sort((a, b) => b.lastAt - a.lastAt).slice(0, 4);
  return { courses, stats, lessonsDone, overall, next, recent, scoreRate: max ? Math.round((got / max) * 100) : null, streak };
}
