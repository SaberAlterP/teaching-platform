import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fillWeeks, mergeSummaries, pct, rates } from "@/lib/report";
import { loadPlatformReport } from "./data";
import { BarCard, PrintButton } from "./Charts";
import { Section, Table, Tile, bandCells, fmtDate, num } from "./parts";

export const metadata = { title: "课程统计" };

const BLUE = "#2f6fed";
const TEAL = "#16a394";

export default async function CoursesReportPage() {
  await requireAdmin();
  const { rows, weeks, uniqueStudents, teachers } = await loadPlatformReport();
  const all = mergeSummaries(rows.map((r) => r.summary));
  const t = rates(all);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const w = fillWeeks(weeks, 12, { progress: 0, subs: 0 }).map((x) => ({ ...x, week: x.week.slice(5) }));
  // 图表按选课人数从多到少，最多显示 15 门，避免柱子太挤
  const top = [...rows].sort((a, b) => b.summary.students - a.summary.students).slice(0, 15);
  const short = (s: string) => (s.length > 8 ? `${s.slice(0, 8)}…` : s);

  return (
    <div className="space-y-8 print:space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">课程统计</h1>
          <p className="mt-1 text-sm text-slate-500">
            全平台所有课程的资源建设和学习情况，点课程名查看该课的统计报告。报告生成时间：{fmtDate(new Date(), true)}
          </p>
        </div>
        <PrintButton />
      </div>

      <Section title="全平台总览">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="课程" value={String(rows.length)} sub={`开课老师 ${teachers} 位`} />
          <Tile label="学生" value={num(uniqueStudents)} sub={`选课 ${num(all.students)} 人次 · 班级 ${sum((r) => r.classes)} 个`} />
          <Tile label="课时" value={num(sum((r) => r.lessons))} sub={`已开放 ${num(sum((r) => r.openLessons))}`} />
          <Tile label="学习任务点" value={num(sum((r) => r.content.tasks))} sub={`视频 ${sum((r) => r.content.video)} · 互动 ${sum((r) => r.content.html)}`} />
          <Tile label="习题题目数" value={num(sum((r) => r.content.questions))} sub={`习题模块 ${sum((r) => r.content.quiz)} 个`} />
          <Tile label="平均完成率" value={pct(t.completion)} sub={`参与学习 ${num(all.active)} 人次（${pct(t.activeRate)}）`} />
          <Tile label="平均得分率" value={pct(t.score)} sub={`作答完成率 ${pct(t.work)}`} />
          <Tile label="综合成绩通过率" value={pct(t.pass, 1)} sub={`待批改 ${all.pending} 份`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <BarCard
            title="近 12 周全平台学习记录"
            data={w}
            xKey="week"
            series={[
              { key: "progress", label: "完成任务点", color: BLUE },
              { key: "subs", label: "提交作答", color: TEAL },
            ]}
            unit="次"
          />
          <BarCard
            title={rows.length > 15 ? "选课人数最多的 15 门课" : "各课程选课人数"}
            data={top.map((r) => ({ name: short(r.title), title: r.title, n: r.summary.students }))}
            xKey="name"
            series={[{ key: "n", label: "学生数", color: BLUE }]}
            unit="人"
          />
        </div>
      </Section>

      <Section title="各课程资源" desc="包括还没开放的草稿课时。">
        <Table
          head={["课程", "老师", "班级", "课时（已开放/全部）", "任务点", "视频", "习题题目", "互动内容", "公告", "创建时间"]}
          rows={rows.map((r) => ({
            key: r.id,
            cells: [
              <Link key="t" href={`/admin/courses/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.title}</Link>,
              r.teacher,
              r.classes,
              `${r.openLessons} / ${r.lessons}`,
              r.content.tasks,
              r.content.video,
              r.content.questions,
              r.content.html,
              r.announcements,
              fmtDate(r.createdAt),
            ],
          }))}
          foot={[
            "全平台合计",
            `${teachers} 位`,
            sum((r) => r.classes),
            `${sum((r) => r.openLessons)} / ${sum((r) => r.lessons)}`,
            sum((r) => r.content.tasks),
            sum((r) => r.content.video),
            sum((r) => r.content.questions),
            sum((r) => r.content.html),
            sum((r) => r.announcements),
            "",
          ]}
          empty="还没有课程"
        />
      </Section>

      <Section title="各课程学习与成绩" desc="只统计已开放课时。综合成绩 = 全部计分项得分 ÷ 满分（没作答按 0 分），60% 及以上算通过；合计行的比例按人次加权。">
        <Table
          head={["课程", "学生", "参与学习", "平均完成率", "作答完成率", "平均得分率", "0～59%", "60～79%", "80～100%", "通过率", "待批改", "最近学习"]}
          rows={rows.map((r) => {
            const x = rates(r.summary);
            return {
              key: r.id,
              cells: [
                <Link key="t" href={`/admin/courses/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.title}</Link>,
                r.summary.students,
                pct(x.activeRate),
                pct(x.completion),
                pct(x.work),
                pct(x.score),
                ...bandCells(r.summary.total, false),
                pct(x.pass, 1),
                r.summary.pending,
                fmtDate(r.summary.last, true),
              ],
            };
          })}
          foot={[
            "全平台合计",
            all.students,
            pct(t.activeRate),
            pct(t.completion),
            pct(t.work),
            pct(t.score),
            ...bandCells(all.total, false),
            pct(t.pass, 1),
            all.pending,
            fmtDate(all.last, true),
          ]}
          empty="还没有课程"
        />
      </Section>
    </div>
  );
}
