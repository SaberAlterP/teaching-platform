"use client";
import { useState } from "react";

type Item = { id: string; label: string; lesson: string; max: number };
type Row = { id: string; name: string; username: string; scores: (number | null)[]; total: number };

export function Gradebook({ items, rows, totalMax, suffix = "" }: { items: Item[]; rows: Row[]; totalMax: number; suffix?: string }) {
  const [sort, setSort] = useState<"username" | "total">("username");
  const sorted = [...rows].sort((a, b) => (sort === "total" ? b.total - a.total : a.username.localeCompare(b.username)));

  async function exportXlsx() {
    // xlsx 库很大（几百 KB），用到时才加载，页面打开更快
    const XLSX = await import("xlsx");
    const data = sorted.map((r) => {
      const o: Record<string, string | number> = { 学号: r.username, 姓名: r.name };
      items.forEach((it, i) => (o[`${it.label}（${it.max}）`] = r.scores[i] ?? ""));
      o[`总分（${totalMax}）`] = r.total;
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "成绩");
    XLSX.writeFile(wb, `成绩册${suffix}_${new Date().toLocaleDateString("zh-CN").replace(/\//g, "-")}.xlsx`);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold">成绩册</h2>
        <select className="input ml-auto w-auto py-1" value={sort} onChange={(e) => setSort(e.target.value as "username")}>
          <option value="username">按学号排序</option>
          <option value="total">按总分排序</option>
        </select>
        <button className="btn-outline" onClick={exportXlsx} disabled={!rows.length}>导出 Excel</button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-4 py-2 font-medium">学生</th>
              {items.map((it) => (
                <th key={it.id} className="px-3 py-2 font-medium whitespace-nowrap" title={it.lesson}>
                  {it.label}<div className="text-xs font-normal text-slate-400">满分 {it.max}</div>
                </th>
              ))}
              <th className="px-4 py-2 font-medium">总分<div className="text-xs font-normal text-slate-400">满分 {totalMax}</div></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="sticky left-0 bg-white px-4 py-2 whitespace-nowrap">
                  {r.name} <span className="text-xs text-slate-400">{r.username}</span>
                </td>
                {r.scores.map((s, i) => (
                  <td key={i} className={`px-3 py-2 ${s === null ? "text-slate-300" : s / items[i].max < 0.6 ? "text-red-600" : ""}`}>
                    {s ?? "—"}
                  </td>
                ))}
                <td className="px-4 py-2 font-semibold">{r.total}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={items.length + 2} className="px-4 py-8 text-center text-slate-400">暂无学生</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
