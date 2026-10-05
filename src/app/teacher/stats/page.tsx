import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";
import { QUESTION_LABELS, type HtmlData, type QuizData } from "@/lib/modules";
import { StatsCharts } from "./StatsCharts";
import { Gradebook } from "./Gradebook";
import { QuestionTable } from "./QuestionTable";
import { Filters } from "./Filters";

export const metadata = { title: "成绩统计" };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ lesson?: string; cls?: string }> }) {
  const t = await requireTeacher();
  const sp = await searchParams;
  const { course } = await getTeacherCourse(t.id);
  const classes = await db.select().from(schema.classes).where(eq(schema.classes.courseId, course.id)).orderBy(asc(schema.classes.createdAt));
  const clsSel = classes.find((c) => c.id === sp.cls);
  const classIds = (clsSel ? [clsSel] : classes).map((c) => c.id);

  const students = await db
    .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username })
    .from(schema.users)
    .innerJoin(schema.enrollments, eq(schema.enrollments.userId, schema.users.id))
    .where(inArray(schema.enrollments.classId, classIds))
    .orderBy(asc(schema.users.username));
  const sids = students.map((s) => s.id);

  const lessons = await db.select().from(schema.lessons).where(eq(schema.lessons.courseId, course.id)).orderBy(asc(schema.lessons.order));
  const lessonSel = lessons.find((l) => l.id === sp.lesson);
  const lids = (lessonSel ? [lessonSel] : lessons).map((l) => l.id);
  // 图文正文很大，统计用不到：只有习题和互动内容才读 data
  const mods = lids.length
    ? await db
        .select({
          id: schema.modules.id,
          lessonId: schema.modules.lessonId,
          order: schema.modules.order,
          type: schema.modules.type,
          title: schema.modules.title,
          data: sql<Record<string, unknown>>`case when ${schema.modules.type} in ('QUIZ', 'HTML') then ${schema.modules.data} else '{}'::jsonb end`,
        })
        .from(schema.modules)
        .where(inArray(schema.modules.lessonId, lids))
        .orderBy(asc(schema.modules.order))
    : [];
  const mids = mods.map((m) => m.id);
  // 只查当前筛选的学生（选了某个班时，不用把全课程的作答都读出来）
  const mySubs = mids.length && sids.length
    ? await db.select().from(schema.submissions).where(and(inArray(schema.submissions.moduleId, mids), inArray(schema.submissions.userId, sids)))
    : [];
  const myProg = mids.length && sids.length
    ? await db.select().from(schema.moduleProgress).where(and(inArray(schema.moduleProgress.moduleId, mids), inArray(schema.moduleProgress.userId, sids)))
    : [];

  // ---- 计分项（习题 + 计分 HTML）----
  const lessonIndex = new Map(lessons.map((l, i) => [l.id, i]));
  const scoredMods = mods
    .filter((m) => m.type === "QUIZ" || (m.type === "HTML" && (m.data as unknown as HtmlData).scored))
    .sort((a, b) => lessonIndex.get(a.lessonId)! - lessonIndex.get(b.lessonId)! || a.order - b.order);
  const items = scoredMods.map((m) => {
    const l = lessons.find((x) => x.id === m.lessonId)!;
    const max = m.type === "QUIZ"
      ? (m.data as unknown as QuizData).questions.reduce((a, b) => a + b.points, 0)
      : (m.data as unknown as HtmlData).maxScore ?? 100;
    return { id: m.id, label: `${lessonIndex.get(l.id)! + 1}. ${m.title || (m.type === "QUIZ" ? "习题" : "互动")}`, lesson: l.title, max };
  });
  const subKey = new Map(mySubs.map((s) => [`${s.userId}:${s.moduleId}`, s]));
  const totalMax = items.reduce((a, b) => a + b.max, 0);
  const book = students.map((s) => {
    const scores = items.map((it) => subKey.get(`${s.id}:${it.id}`)?.score ?? null);
    const total = scores.reduce<number>((a, b) => a + (b ?? 0), 0);
    return { ...s, scores, total };
  });

  // ---- 每道题的正确率 ----
  const questionStats = mods
    .filter((m) => m.type === "QUIZ")
    .sort((a, b) => lessonIndex.get(a.lessonId)! - lessonIndex.get(b.lessonId)! || a.order - b.order)
    .flatMap((m) => {
      const quiz = m.data as unknown as QuizData;
      const ss = mySubs.filter((s) => s.moduleId === m.id);
      const l = lessons.find((x) => x.id === m.lessonId)!;
      return quiz.questions.map((q, qi) => {
        const attempted = ss.filter((s) => q.id in s.itemScores); // 题目后加的，旧作答不计入
        const graded = attempted.map((s) => s.itemScores[q.id]).filter((v): v is number => typeof v === "number");
        const avg = graded.length ? graded.reduce((a, b) => a + b, 0) / graded.length : null;
        return {
          key: `${m.id}:${q.id}`,
          where: `${lessonIndex.get(l.id)! + 1}. ${l.title}${m.title ? ` / ${m.title}` : ""}`,
          no: qi + 1,
          type: QUESTION_LABELS[q.type],
          prompt: q.prompt.replace(/[#*`>\n]/g, " ").slice(0, 60),
          answered: attempted.length,
          rate: avg === null || !q.points ? null : avg / q.points,
        };
      });
    });

  // ---- 每个课时完成率 ----
  const lessonCompletion = lessons.map((l, i) => ({ l, i })).filter(({ l }) => lids.includes(l.id)).map(({ l, i }) => {
    const lm = mods.filter((m) => m.lessonId === l.id).map((m) => m.id);
    const set = new Set(lm);
    const done = myProg.filter((p) => set.has(p.moduleId)).length;
    const denom = lm.length * students.length;
    return { name: `第${i + 1}课`, title: l.title, rate: denom ? Math.round((done / denom) * 100) : 0 };
  });

  // ---- 每个课时的平均得分率（只算已作答的计分项）----
  const lessonScore = lessons
    .map((l, i) => {
      let got = 0;
      let full = 0;
      for (const it of items) {
        const mod = scoredMods.find((m) => m.id === it.id)!;
        if (mod.lessonId !== l.id) continue;
        for (const s of mySubs) {
          if (s.moduleId === it.id && s.score !== null) { got += s.score; full += it.max; }
        }
      }
      return { name: `第${i + 1}课`, title: l.title, rate: full ? Math.round((got / full) * 100) : null, in: lids.includes(l.id) };
    })
    .filter((x) => x.in && x.rate !== null) as { name: string; title: string; rate: number }[];

  // ---- 总分分布 ----
  const buckets = ["0-59%", "60-69%", "70-79%", "80-89%", "90-100%"].map((name) => ({ name, count: 0 }));
  if (totalMax > 0)
    for (const b of book) {
      const p = (b.total / totalMax) * 100;
      buckets[p < 60 ? 0 : p < 70 ? 1 : p < 80 ? 2 : p < 90 ? 3 : 4].count++;
    }

  const avgCompletion = mods.length && students.length ? Math.round((myProg.length / (mods.length * students.length)) * 100) : 0;
  const avgScore = book.length && totalMax ? Math.round((book.reduce((a, b) => a + b.total, 0) / book.length / totalMax) * 100) : 0;
  const pending = mySubs.filter((s) => s.needsGrading).length;
  const weakest = questionStats.filter((q) => q.rate !== null && q.answered > 0).sort((a, b) => a.rate! - b.rate!).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">成绩统计</h1>
        <Filters
          lessons={lessons.map((l, i) => ({ id: l.id, label: `${i + 1}. ${l.title}` }))}
          classes={classes.map((c) => ({ id: c.id, label: c.name }))}
          lesson={lessonSel?.id ?? ""}
          cls={clsSel?.id ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="学生人数" value={String(students.length)} />
        <Tile label="平均完成度" value={`${avgCompletion}%`} />
        <Tile label="平均得分率" value={totalMax ? `${avgScore}%` : "—"} sub={totalMax ? `满分 ${totalMax}` : "暂无计分项"} />
        <Tile label="待批改" value={String(pending)} href={pending ? "/teacher/grading" : undefined} />
      </div>

      <StatsCharts lessonCompletion={lessonCompletion} lessonScore={lessonScore} buckets={buckets} />

      <QuestionTable rows={questionStats} studentCount={students.length} weakest={weakest.map((w) => `${w.where.split(" / ")[0].split(". ")[0]}课第${w.no}题（${Math.round(w.rate! * 100)}%）`)} />

      <Gradebook suffix={lessonSel ? `_${lessonSel.title}` : ""} items={items} rows={book} totalMax={totalMax} />
    </div>
  );
}

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const inner = (
    <>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </>
  );
  return href ? <a href={href} className="card block p-4 hover:border-brand-500">{inner}</a> : <div className="card p-4">{inner}</div>;
}
