import { count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";
import { CourseCard } from "@/components/CourseCard";
import { openCourse } from "./actions";
import { PendingButton } from "@/components/PendingButton";
import { NewCourseTile } from "./NewCourseTile";
import { HomeComposer } from "./HomeComposer";
import { getAiSettings } from "@/lib/ai/settings";

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false })) % 24;
  return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
}

// 教师首页：我教的课程，每门课一个方块，点进去是这门课的课时
export default async function TeacherHome() {
  const t = await requireTeacher();
  const [{ courses }, ai] = await Promise.all([getTeacherCourse(t.id), getAiSettings()]);
  const ids = courses.map((c) => c.id);
  const lessonRows = await db
    .select({ courseId: schema.lessons.courseId, status: schema.lessons.status, n: count() })
    .from(schema.lessons)
    .where(inArray(schema.lessons.courseId, ids))
    .groupBy(schema.lessons.courseId, schema.lessons.status);
  const studentRows = await db
    .select({ courseId: schema.classes.courseId, n: count() })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .where(inArray(schema.classes.courseId, ids))
    .groupBy(schema.classes.courseId);
  const stat = (cid: string) => {
    const rows = lessonRows.filter((r) => r.courseId === cid);
    const num = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.n, 0);
    return {
      lessons: rows.reduce((a, r) => a + r.n, 0),
      open: num("OPEN") + num("SCHEDULED"),
      draft: num("DRAFT"),
      students: studentRows.find((r) => r.courseId === cid)?.n ?? 0,
    };
  };

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4 py-10 sm:py-14">
        <div className="pointer-events-none absolute -top-16 -left-10 h-56 w-56 rounded-full bg-brand-100 opacity-70 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-20 h-64 w-64 rounded-full bg-brand-100 opacity-70 blur-3xl" />
        <div className="relative mb-7 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting()}，<span className="text-brand-600">{t.name}</span>
          </h1>
          <p className="mt-2 text-lg text-slate-500">接下来想做点什么？</p>
        </div>
        <div className="relative"><HomeComposer hasKey={ai.hasKey} isAdmin={t.isAdmin} /></div>
      </section>
      <section className="space-y-5">
      <div className="flex items-end gap-3">
        <h2 className="text-2xl font-bold">我的课程</h2>
        <span className="pb-0.5 text-slate-500">共 {courses.length} 门</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {courses.map((c, i) => {
          const s = stat(c.id);
          const empty = s.lessons === 0;
          return (
            <form key={c.id} action={openCourse.bind(null, c.id)} className="group">
              <PendingButton className="block h-full w-full text-left">
                <CourseCard title={c.title} description={c.description} index={i} muted={empty}>
                  {empty ? (
                    <div className="text-sm text-slate-400">还没有课时 · 点击进入开始建设</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 text-xs font-medium">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{s.lessons} 课时</span>
                      {s.open > 0 && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{s.open} 已开放</span>}
                      {s.draft > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{s.draft} 草稿</span>}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-slate-400">学生 {s.students} 人</div>
                </CourseCard>
              </PendingButton>
            </form>
          );
        })}
        <NewCourseTile />
      </div>
      </section>
    </div>
  );
}
