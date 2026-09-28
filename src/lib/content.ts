import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { gradeQuiz, type QuizData } from "./modules";
import { cleanupOrphanAssets } from "./storage";

// 课程内容相关的公共逻辑：教师后台（Server Actions）和 AI 接口（/api/ai）共用

export async function writeOrder(ids: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++)
      await tx.update(schema.modules).set({ order: i }).where(eq(schema.modules.id, ids[i]));
  });
}

// 清理不再使用的上传文件；出错也不影响老师当前的操作
export async function cleanupFiles() {
  try {
    await cleanupOrphanAssets();
  } catch (e) {
    console.error("清理上传文件失败", e);
  }
}

export function validateQuiz(q: QuizData) {
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

// 老师改了题目（答案、分值、增删题）后，按新题目重新计算已交作答的成绩。
// 已人工批改的简答题保留老师给的分（不超过新的分值）。
export async function regradeSubmissions(moduleId: string, quiz: QuizData) {
  const subs = await db.query.submissions.findMany({ where: eq(schema.submissions.moduleId, moduleId) });
  for (const s of subs) {
    const g = gradeQuiz(quiz, s.answers);
    for (const q of quiz.questions) {
      const old = s.itemScores[q.id];
      if (q.type === "short" && g.itemScores[q.id] === null && typeof old === "number")
        g.itemScores[q.id] = Math.min(old, q.points);
    }
    const vals = Object.values(g.itemScores);
    const score = vals.reduce<number>((a, b) => a + (b ?? 0), 0);
    const needsGrading = vals.some((v) => v === null);
    const changed =
      score !== s.score || g.maxScore !== s.maxScore || needsGrading !== s.needsGrading ||
      JSON.stringify(g.itemScores) !== JSON.stringify(s.itemScores);
    if (changed)
      await db
        .update(schema.submissions)
        .set({ itemScores: g.itemScores, score, maxScore: g.maxScore, needsGrading })
        .where(eq(schema.submissions.id, s.id));
  }
}
