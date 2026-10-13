// 课程统计报告的汇总口径（纯计算，不碰数据库，方便单元测试）
// 数据库只按“每个学生”汇总出 StudentStat，再在这里算出完成率、分数段、通过率等

// 一个学生在一门课里的学习数据（只算已开放课时里的内容）
export type StudentStat = {
  done: number; // 完成的任务点（模块）数
  subs: number; // 作答过的计分项数（习题、计分互动内容）
  got: number; // 作答的得分合计
  full: number; // 作答的满分合计（用来算“已作答部分的得分率”）
  pending: number; // 还有简答题待批改的作答数
  last: Date | null; // 最近一次学习时间
};

// 一门课的规模：任务点数、计分项数、计分项满分合计
export type CourseShape = { tasks: number; scoredItems: number; totalMax: number };

export type Bands = { none: number; fail: number; mid: number; good: number };
const emptyBands = (): Bands => ({ none: 0, fail: 0, mid: 0, good: 0 });

// 得分率（0~1）落在哪个分数段：0~59 / 60~79 / 80~100
export function band(rate: number): Exclude<keyof Bands, "none"> {
  const p = rate * 100;
  return p < 60 ? "fail" : p < 80 ? "mid" : "good";
}

// 汇总结果只放“可相加”的原始数，比例用 rates() 再算；这样多个班、多门课可以直接合并
export type Summary = {
  students: number;
  active: number; // 学过（完成过任务点或作答过）的人数
  done: number; // 完成任务点人次
  taskSlots: number; // 任务点数 × 学生数（完成率的分母）
  subs: number; // 作答人次
  workSlots: number; // 计分项数 × 学生数（作答完成率的分母）
  rateSum: number; // 每人“已作答部分得分率”之和
  rated: number; // 有成绩的人数
  work: Bands; // 按已作答部分得分率分段（没作答的算“未获得成绩”）
  graded: number; // 有计分项的课程里的学生数（综合成绩的人数）
  total: Bands; // 综合成绩分段：全部计分项得分 / 满分，没作答的按 0 分
  passed: number; // 综合成绩 ≥ 60% 的人数
  pending: number;
  last: Date | null;
};

export function emptySummary(): Summary {
  return {
    students: 0, active: 0, done: 0, taskSlots: 0, subs: 0, workSlots: 0, rateSum: 0, rated: 0,
    work: emptyBands(), graded: 0, total: emptyBands(), passed: 0, pending: 0, last: null,
  };
}

const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

// 一组学生（一个班或一门课）在同一门课里的汇总
export function summarize(rows: StudentStat[], shape: CourseShape): Summary {
  const s = emptySummary();
  for (const r of rows) {
    s.students++;
    if (r.done > 0 || r.subs > 0) s.active++;
    s.done += Math.min(r.done, shape.tasks); // 课时改回草稿等情况下不让完成数超过任务点数
    s.subs += Math.min(r.subs, shape.scoredItems);
    s.pending += r.pending;
    s.last = later(s.last, r.last);
    if (r.subs > 0 && r.full > 0) {
      const rate = r.got / r.full;
      s.rateSum += rate;
      s.rated++;
      s.work[band(rate)]++;
    } else s.work.none++;
    if (shape.totalMax > 0) {
      const rate = r.got / shape.totalMax;
      s.graded++;
      s.total[band(rate)]++;
      if (rate >= 0.6) s.passed++;
    }
  }
  s.taskSlots = shape.tasks * s.students;
  s.workSlots = shape.scoredItems * s.students;
  return s;
}

// 合并多个汇总（全平台合计 = 各课程相加）
export function mergeSummaries(list: Summary[]): Summary {
  const out = emptySummary();
  for (const s of list) {
    out.students += s.students;
    out.active += s.active;
    out.done += s.done;
    out.taskSlots += s.taskSlots;
    out.subs += s.subs;
    out.workSlots += s.workSlots;
    out.rateSum += s.rateSum;
    out.rated += s.rated;
    out.graded += s.graded;
    out.passed += s.passed;
    out.pending += s.pending;
    out.last = later(out.last, s.last);
    for (const k of Object.keys(out.work) as (keyof Bands)[]) {
      out.work[k] += s.work[k];
      out.total[k] += s.total[k];
    }
  }
  return out;
}

// 各项比例（0~1）；分母为 0 时是 null，页面上显示“—”
export function rates(s: Summary) {
  const r = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    completion: r(s.done, s.taskSlots), // 平均完成率
    work: r(s.subs, s.workSlots), // 作答完成率
    score: r(s.rateSum, s.rated), // 已作答部分的平均得分率
    pass: r(s.passed, s.graded), // 通过率
    activeRate: r(s.active, s.students), // 参与学习的比例
  };
}

// 比例显示成百分比，null 显示“—”
export const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toFixed(digits)}%`);

// 补齐最近 n 周（周一开始）的数据，没有记录的周补 0。weekKeys 是 "YYYY-MM-DD"（周一的日期，北京时间）
export function fillWeeks<T extends Record<string, number>>(
  rows: ({ week: string } & T)[],
  n: number,
  zero: T,
  now = new Date(),
): ({ week: string } & T)[] {
  // 先换成北京时间的日期，再退回到周一
  const bj = new Date(now.getTime() + 8 * 3600_000);
  const day = (bj.getUTCDay() + 6) % 7; // 周一 = 0
  const monday = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate() - day);
  const by = new Map(rows.map((r) => [r.week, r]));
  const out: ({ week: string } & T)[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const week = new Date(monday - i * 7 * 86400_000).toISOString().slice(0, 10);
    out.push(by.get(week) ?? { week, ...zero });
  }
  return out;
}
