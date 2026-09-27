import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { stripAnswers, type HtmlData, type QuizData } from "./modules";
import type { ViewModule } from "@/components/modules/LessonView";
import type { QuizResult } from "@/app/learn/actions";

// 组装上课页面需要的数据。studentId 为空表示老师预览（保留答案）。
export async function loadLessonView(lessonId: string, studentId?: string) {
  const mods = await db.query.modules.findMany({
    where: eq(schema.modules.lessonId, lessonId),
    orderBy: asc(schema.modules.order),
  });
  const assetIds = mods.filter((m) => m.type === "HTML").map((m) => (m.data as unknown as HtmlData).assetId).filter(Boolean);
  const assets = assetIds.length ? await db.select().from(schema.assets).where(inArray(schema.assets.id, assetIds)) : [];
  const assetMap = new Map(assets.map((a) => [a.id, `/pkg/${a.id}/${a.entry}`]));

  const modules: ViewModule[] = mods.map((m) => ({
    id: m.id,
    type: m.type,
    title: m.title,
    data: m.type === "QUIZ" && studentId ? (stripAnswers(m.data as unknown as QuizData) as unknown as Record<string, unknown>) : m.data,
    packageUrl: m.type === "HTML" ? assetMap.get((m.data as unknown as HtmlData).assetId) : undefined,
  }));

  const results: Record<string, QuizResult> = {};
  const htmlScores: Record<string, { score: number; maxScore: number }> = {};
  let completed: string[] = [];
  if (studentId && mods.length) {
    const ids = mods.map((m) => m.id);
    const subs = await db
      .select()
      .from(schema.submissions)
      .where(and(eq(schema.submissions.userId, studentId), inArray(schema.submissions.moduleId, ids)));
    for (const s of subs) {
      const m = mods.find((x) => x.id === s.moduleId)!;
      if (m.type === "QUIZ") {
        const quiz = m.data as unknown as QuizData;
        results[s.moduleId] = {
          itemScores: s.itemScores,
          score: s.score,
          maxScore: s.maxScore,
          needsGrading: s.needsGrading,
          attempts: s.attempts,
          answers: s.answers,
          reveal: quiz.showAnswers
            ? Object.fromEntries(quiz.questions.map((q) => [q.id, { answer: q.answer, explanation: q.explanation }]))
            : undefined,
        };
      } else {
        htmlScores[s.moduleId] = { score: s.score, maxScore: s.maxScore };
      }
    }
    const prog = await db
      .select({ id: schema.moduleProgress.moduleId })
      .from(schema.moduleProgress)
      .where(and(eq(schema.moduleProgress.userId, studentId), inArray(schema.moduleProgress.moduleId, ids)));
    completed = prog.map((p) => p.id);
  }
  return { modules, results, htmlScores, completed };
}
