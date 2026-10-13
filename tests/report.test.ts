import { describe, expect, it } from "vitest";
import { band, fillWeeks, mergeSummaries, pct, rates, summarize, type StudentStat } from "@/lib/report";

const st = (p: Partial<StudentStat>): StudentStat => ({ done: 0, subs: 0, got: 0, full: 0, pending: 0, last: null, ...p });

describe("band", () => {
  it("按 60、80 分界", () => {
    expect(band(0)).toBe("fail");
    expect(band(0.599)).toBe("fail");
    expect(band(0.6)).toBe("mid");
    expect(band(0.79)).toBe("mid");
    expect(band(0.8)).toBe("good");
    expect(band(1)).toBe("good");
  });
});

describe("summarize", () => {
  const shape = { tasks: 10, scoredItems: 2, totalMax: 20 };
  const rows = [
    st({ done: 10, subs: 2, got: 18, full: 20, last: new Date("2026-10-01") }), // 90%
    st({ done: 5, subs: 1, got: 7, full: 10, pending: 1, last: new Date("2026-10-05") }), // 已作答 70%，综合 35%
    st({}), // 没学
  ];
  const s = summarize(rows, shape);

  it("人数、完成率、作答完成率", () => {
    expect(s.students).toBe(3);
    expect(s.active).toBe(2);
    const r = rates(s);
    expect(r.completion).toBeCloseTo(15 / 30);
    expect(r.work).toBeCloseTo(3 / 6);
    expect(r.activeRate).toBeCloseTo(2 / 3);
  });

  it("得分率只算已作答部分，没作答算未获得成绩", () => {
    expect(rates(s).score).toBeCloseTo((0.9 + 0.7) / 2);
    expect(s.work).toEqual({ none: 1, fail: 0, mid: 1, good: 1 });
  });

  it("综合成绩：没作答按 0 分，≥60% 通过", () => {
    expect(s.total).toEqual({ none: 0, fail: 2, mid: 0, good: 1 });
    expect(s.passed).toBe(1);
    expect(rates(s).pass).toBeCloseTo(1 / 3);
    expect(s.pending).toBe(1);
    expect(s.last?.toISOString().slice(0, 10)).toBe("2026-10-05");
  });

  it("完成数不会超过任务点数", () => {
    const x = summarize([st({ done: 50, subs: 9 })], shape);
    expect(rates(x).completion).toBe(1);
    expect(rates(x).work).toBe(1);
  });

  it("没有计分项时不算综合成绩，比例为 null", () => {
    const x = summarize([st({ done: 1 })], { tasks: 0, scoredItems: 0, totalMax: 0 });
    expect(x.graded).toBe(0);
    const r = rates(x);
    expect(r.completion).toBeNull();
    expect(r.pass).toBeNull();
    expect(pct(r.pass)).toBe("—");
  });

  it("没有学生", () => {
    const r = rates(summarize([], shape));
    expect(r.completion).toBeNull();
    expect(r.score).toBeNull();
  });
});

describe("mergeSummaries", () => {
  it("各课程相加，比例按人次加权", () => {
    const a = summarize([st({ done: 4, subs: 1, got: 10, full: 10 })], { tasks: 4, scoredItems: 1, totalMax: 10 });
    const b = summarize([st({}), st({})], { tasks: 6, scoredItems: 1, totalMax: 10 });
    const m = mergeSummaries([a, b]);
    expect(m.students).toBe(3);
    expect(m.taskSlots).toBe(4 + 12);
    expect(rates(m).completion).toBeCloseTo(4 / 16);
    expect(m.total).toEqual({ none: 0, fail: 2, mid: 0, good: 1 });
    expect(m.work).toEqual({ none: 2, fail: 0, mid: 0, good: 1 });
    expect(rates(m).pass).toBeCloseTo(1 / 3);
  });
});

describe("fillWeeks", () => {
  it("补齐最近几周（北京时间周一）", () => {
    // 2026-10-12 是周一；UTC 周日 20:00 已是北京时间周一凌晨
    const now = new Date("2026-10-11T20:00:00Z");
    const w = fillWeeks([{ week: "2026-10-05", n: 3 }], 3, { n: 0 }, now);
    expect(w).toEqual([
      { week: "2026-09-28", n: 0 },
      { week: "2026-10-05", n: 3 },
      { week: "2026-10-12", n: 0 },
    ]);
  });
});
