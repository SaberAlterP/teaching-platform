"use server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { studentCanSeeLesson } from "@/lib/course";
import { gradeQuiz, type HtmlData, type QuizData } from "@/lib/modules";

async function loadModule(moduleId: string, userId: string) {
  const m = await db.query.modules.findFirst({ where: eq(schema.modules.id, moduleId) });
  if (!m) throw new Error("模块不存在");
  if (!(await studentCanSeeLesson(userId, m.lessonId))) throw new Error("该课时尚未开放");
  return m;
}

async function complete(userId: string, moduleId: string) {
  await db.insert(schema.moduleProgress).values({ userId, moduleId }).onConflictDoNothing();
}

export async function markComplete(moduleId: string) {
  const u = await requireStudent();
  await loadModule(moduleId, u.id);
  await complete(u.id, moduleId);
}

export type QuizResult = {
  itemScores: Record<string, number | null>;
  score: number;
  maxScore: number;
  needsGrading: boolean;
  attempts: number;
  answers: Record<string, unknown>;
  // 正确答案与解析（仅在老师开启"提交后显示答案"时返回）
  reveal?: Record<string, { answer: unknown; explanation?: string }>;
  error?: string;
};

export async function submitQuiz(moduleId: string, answers: Record<string, unknown>): Promise<QuizResult> {
  const u = await requireStudent();
  let m;
  try {
    m = await loadModule(moduleId, u.id);
  } catch (e) {
    return { error: (e as Error).message } as QuizResult;
  }
  if (m.type !== "QUIZ") return { error: "不是习题模块" } as QuizResult;
  const quiz = m.data as unknown as QuizData;

  const existing = await db.query.submissions.findFirst({
    where: (s, { and }) => and(eq(s.userId, u.id), eq(s.moduleId, moduleId)),
  });
  if (existing && !quiz.allowRetry) return { error: "这组题不允许重做" } as QuizResult;

  // 只保留本题组里存在的题目答案，防止塞入无关数据
  const clean: Record<string, unknown> = {};
  for (const q of quiz.questions) if (q.id in answers) clean[q.id] = answers[q.id];
  const g = gradeQuiz(quiz, clean);

  const [row] = await db
    .insert(schema.submissions)
    .values({ userId: u.id, moduleId, answers: clean, ...g })
    .onConflictDoUpdate({
      target: [schema.submissions.userId, schema.submissions.moduleId],
      set: { answers: clean, ...g, attempts: sql`${schema.submissions.attempts} + 1` },
    })
    .returning();
  await complete(u.id, moduleId);

  return {
    ...g,
    attempts: row.attempts,
    answers: clean,
    reveal: quiz.showAnswers
      ? Object.fromEntries(quiz.questions.map((q) => [q.id, { answer: q.answer, explanation: q.explanation }]))
      : undefined,
  };
}

// HTML 包（游戏）上报成绩：记录最高分
export async function reportHtmlScore(moduleId: string, score: number, detail?: unknown) {
  const u = await requireStudent();
  const m = await loadModule(moduleId, u.id);
  if (m.type !== "HTML") return;
  const d = m.data as unknown as HtmlData;
  await complete(u.id, moduleId);
  if (!d.scored) return;
  const max = d.maxScore ?? 100;
  const s = Math.max(0, Math.min(max, Number(score) || 0));
  let detailStr = "null";
  try { detailStr = JSON.stringify(detail ?? null); } catch {}
  const payload = { last: s, detail: detailStr.length < 20000 ? JSON.parse(detailStr) : null };
  await db
    .insert(schema.submissions)
    .values({ userId: u.id, moduleId, answers: payload, score: s, maxScore: max })
    .onConflictDoUpdate({
      target: [schema.submissions.userId, schema.submissions.moduleId],
      set: {
        answers: payload,
        score: sql`greatest(${schema.submissions.score}, ${s})`,
        maxScore: max,
        attempts: sql`${schema.submissions.attempts} + 1`,
      },
    });
}
