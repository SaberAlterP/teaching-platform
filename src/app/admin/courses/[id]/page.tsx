import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { QUESTION_LABELS, type QuestionType } from "@/lib/modules";
import { fillWeeks, pct, rates, type Summary } from "@/lib/report";
import { loadCourseReport } from "../data";
import { BarCard, PrintButton } from "../Charts";
import { Section, Table, Tile, bandCells, fmtDate, num } from "../parts";

export const metadata = { title: "课程统计报告" };

const BLUE = "#2f6fed";
const TEAL = "#16a394";
const BAND_COLORS = { fail: "#ef6b6b", mid: "#f5b041", good: "#16a394" };

export default async function CourseReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const r = await loadCourseReport(id);
  if (!r) notFound();
  const { course, classes, content, open, summary } = r;
  const total = rates(summary);
  const openLessons = r.lessons.filter((x) => x.visible).length;
  const weeks = fillWeeks(r.weeks, 12, { progress: 0, subs: 0 }).map((w) => ({ ...w, week: w.week.slice(5) }));
  const qt = new Map(r.questionTypes.map((x) => [x.type, x.n]));

  // 每个班一行 + 合计行，四张表共用
  const classRow = (s: Summary) => ({ s, x: rates(s) });

  return (
    <div className="space-y-8 print:space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/admin/courses" className="text-sm text-slate-500 hover:text-brand-600 print:hidden">← 全部课程</Link>
          <h1 className="mt-1 text-2xl font-bold">《{course.title}》课程统计报告</h1>
          <p className="mt-1 text-sm text-slate-500">
            主讲教师：{course.teacher}（{course.teacherUsername}）· 报告生成时间：{fmtDate(new Date(), true)}
          </p>
        </div>
        <PrintButton />
      </div>

      <Section title="一、课程基础概况">
        <div className="card grid gap-x-8 gap-y-2 p-4 text-sm sm:grid-cols-2">
          <Info k="课程名称" v={course.title} />
          <Info k="开课教师" v={`${course.teacher}（${course.teacherUsername}）`} />
          <Info k="创建时间" v={fmtDate(course.createdAt)} />
          <Info k="班级数" v={`${classes.length} 个`} />
          <Info k="累计选课人数" v={`${summary.students} 人`} />
          <Info k="课时" v={`已开放 ${openLessons} / 共 ${r.lessons.length} 课时`} />
          <div className="sm:col-span-2">
            <span className="text-slate-500">课程介绍：</span>
            <span className="whitespace-pre-wrap">{course.description || "（未填写）"}</span>
          </div>
        </div>
      </Section>

      <Section title="二、课程资源" desc="课程里已建好的教学内容（包括还没开放的草稿课时）。每个内容模块是学生的一个学习任务点。">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="课时" value={String(r.lessons.length)} sub={`已开放 ${openLessons}`} />
          <Tile label="学习任务点" value={String(content.tasks)} sub={`已开放 ${open.tasks}`} />
          <Tile label="习题题目数" value={String(content.questions)} sub={`习题模块 ${content.quiz} 个`} />
          <Tile label="课程公告" value={String(r.announcements)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Table
            head={["任务点类型", "全部", "已开放"]}
            rows={[
              ["图文", content.richtext, open.richtext],
              ["视频", content.video, open.video],
              ["图片", content.image, open.image],
              ["习题", content.quiz, open.quiz],
              ["互动内容（HTML 包）", content.html, open.html],
            ].map(([k, a, b]) => ({ key: String(k), cells: [k, a, b] }))}
            foot={["合计", content.tasks, open.tasks]}
          />
          <Table
            head={["题型", "题目数"]}
            rows={(Object.keys(QUESTION_LABELS) as QuestionType[]).map((t) => ({ key: t, cells: [QUESTION_LABELS[t], qt.get(t) ?? 0] }))}
            foot={["合计", content.questions]}
          />
        </div>
      </Section>

      <Section title="三、选课统计">
        <Table
          head={["班级名称", "学生数", "创建时间"]}
          rows={classes.map((c) => ({ key: c.id, cells: [c.name, `${c.summary.students} 人`, fmtDate(c.createdAt)] }))}
          foot={[`合计 ${classes.length} 个班`, `${summary.students} 人`, ""]}
          empty="还没有班级"
        />
        <BarCard
          title="各班级选课人数"
          data={classes.map((c) => ({ name: c.name, n: c.summary.students }))}
          xKey="name"
          series={[{ key: "n", label: "学生数", color: BLUE }]}
          unit="人"
        />
      </Section>

      <Section title="四、学习情况" desc="只统计已开放课时；完成率 = 完成的任务点人次 ÷（任务点数 × 学生数）。">
        <Table
          head={["班级", "学生数", "参与学习人数", "完成任务点人次", "平均完成率", "最近学习"]}
          rows={classes.map((c) => {
            const { s, x } = classRow(c.summary);
            return { key: c.id, cells: [c.name, s.students, `${s.active}（${pct(x.activeRate)}）`, num(s.done), pct(x.completion), fmtDate(s.last, true)] };
          })}
          foot={["汇总", summary.students, `${summary.active}（${pct(total.activeRate)}）`, num(summary.done), pct(total.completion), fmtDate(summary.last, true)]}
          empty="还没有班级"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <BarCard
            title="近 12 周学习记录"
            data={weeks}
            xKey="week"
            series={[
              { key: "progress", label: "完成任务点", color: BLUE },
              { key: "subs", label: "提交作答", color: TEAL },
            ]}
            unit="次"
          />
          <BarCard
            title="各课时完成率"
            data={r.lessonCompletion}
            xKey="name"
            series={[{ key: "rate", label: "完成率", color: BLUE }]}
            percent
          />
        </div>
      </Section>

      <Section
        title="五、习题 / 作业"
        desc={`计分项是习题和接收成绩的互动内容，已开放 ${open.scoredItems} 个。得分率只算学生已作答的部分；未作答的学生记为“未获得成绩”。`}
      >
        <Table
          head={["班级", "计分项数", "作答完成率", "平均得分率", "未获得成绩", "0～59%", "60～79%", "80～100%", "待批改"]}
          rows={classes.map((c) => {
            const { s, x } = classRow(c.summary);
            return { key: c.id, cells: [c.name, open.scoredItems, pct(x.work), pct(x.score), ...bandCells(s.work), s.pending] };
          })}
          foot={["汇总", open.scoredItems, pct(total.work), pct(total.score), ...bandCells(summary.work), summary.pending]}
          empty="还没有班级"
        />
      </Section>

      <Section
        title="六、综合成绩"
        desc={
          open.totalMax > 0
            ? `综合成绩 = 全部已开放计分项的得分之和 ÷ 满分（${num(open.totalMax)} 分），没作答的按 0 分计；得分率 60% 及以上算通过。`
            : "已开放的课时里还没有计分项，暂时无法计算综合成绩。"
        }
      >
        <Table
          head={["班级", "人数", "0～59%", "60～79%", "80～100%", "通过率"]}
          rows={classes.map((c) => {
            const { s, x } = classRow(c.summary);
            return { key: c.id, cells: [c.name, `${s.students} 人`, ...bandCells(s.total, false), pct(x.pass, 1)] };
          })}
          foot={["汇总", `${summary.students} 人`, ...bandCells(summary.total, false), pct(total.pass, 1)]}
          empty="还没有班级"
        />
        <BarCard
          title="各班级综合成绩分布"
          data={classes.map((c) => ({ name: c.name, ...c.summary.total }))}
          xKey="name"
          series={[
            { key: "fail", label: "0～59%", color: BAND_COLORS.fail, stack: "a" },
            { key: "mid", label: "60～79%", color: BAND_COLORS.mid, stack: "a" },
            { key: "good", label: "80～100%", color: BAND_COLORS.good, stack: "a" },
          ]}
          unit="人"
        />
      </Section>

      <p className="text-xs text-slate-400">
        说明：本平台不记录签到、讨论、在线考试和页面访问次数，报告中没有这几项；“学习记录”以学生完成任务点、提交作答为准。
      </p>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-slate-500">{k}：</span>
      {v}
    </div>
  );
}
