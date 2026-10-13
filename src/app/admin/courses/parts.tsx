// 统计报告页面共用的小组件（服务器组件）
import type { Bands } from "@/lib/report";

export const num = (n: number) => n.toLocaleString("zh-CN");
export const fmtDate = (d: Date | null, time = false) =>
  d
    ? new Date(d).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
        ...(time ? {} : { year: "numeric", month: "2-digit", day: "2-digit" }),
      })
    : "—";

export function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {desc && <p className="mt-0.5 text-sm text-slate-500">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4 break-inside-avoid">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

// 简单表格：第一列左对齐，其余右对齐；foot 是合计行
export function Table({
  head,
  rows,
  foot,
  empty = "暂无数据",
}: {
  head: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  foot?: React.ReactNode[];
  empty?: string;
}) {
  const cls = (i: number) => (i === 0 ? "px-4 py-2 text-left" : "px-3 py-2 text-right whitespace-nowrap");
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{head.map((h, i) => <th key={h} className={`${cls(i)} font-medium`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              {r.cells.map((c, i) => <td key={i} className={cls(i)}>{c}</td>)}
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={head.length} className="px-4 py-6 text-center text-slate-400">{empty}</td></tr>
          )}
        </tbody>
        {foot && rows.length > 0 && (
          <tfoot className="border-t-2 border-slate-200 font-semibold">
            <tr>{foot.map((c, i) => <td key={i} className={cls(i)}>{c}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// 分数段四列：未获得成绩 / 0~59 / 60~79 / 80~100
export const bandCells = (b: Bands, withNone = true) => [
  ...(withNone ? [`${b.none} 人`] : []),
  `${b.fail} 人`,
  `${b.mid} 人`,
  `${b.good} 人`,
];
