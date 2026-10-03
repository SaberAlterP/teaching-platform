"use client";
import * as XLSX from "xlsx";

type Row = { key: string; where: string; no: number; type: string; prompt: string; answered: number; rate: number | null };

export function QuestionTable({ rows, studentCount, weakest }: { rows: Row[]; studentCount: number; weakest: string[] }) {
  function exportXlsx() {
    const data = rows.map((q) => ({
      位置: q.where,
      题号: q.no,
      题型: q.type,
      题目: q.prompt,
      作答人数: q.answered,
      学生人数: studentCount,
      "得分率(%)": q.rate === null ? "" : Math.round(q.rate * 100),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "题目得分率");
    XLSX.writeFile(wb, `题目得分率_${new Date().toLocaleDateString("zh-CN").replace(/\//g, "-")}.xlsx`);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold">每道题的得分率</h2>
        {weakest.length > 0 && <span className="text-sm text-slate-500">最需要讲评：{weakest.join("、")}</span>}
        <button className="btn-outline ml-auto" onClick={exportXlsx} disabled={!rows.length}>导出 Excel</button>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">位置</th>
              <th className="px-4 py-2 font-medium">题目</th>
              <th className="px-4 py-2 font-medium">作答人数</th>
              <th className="w-56 px-4 py-2 font-medium">得分率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((q) => (
              <tr key={q.key}>
                <td className="px-4 py-2 whitespace-nowrap text-slate-500">{q.where} · 第{q.no}题</td>
                <td className="px-4 py-2"><span className="mr-1 text-xs text-slate-400">[{q.type}]</span>{q.prompt}</td>
                <td className="px-4 py-2 text-slate-600">{q.answered}/{studentCount}</td>
                <td className="px-4 py-2">
                  {q.rate === null ? (
                    <span className="text-slate-300">{q.answered ? "待批改" : "暂无数据"}</span>
                  ) : (
                    <div className="flex items-center gap-2" title={`${Math.round(q.rate * 100)}%`}>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${q.rate < 0.6 ? "bg-red-400" : "bg-brand-500"}`} style={{ width: `${q.rate * 100}%` }} />
                      </div>
                      <span className="w-10 text-right text-slate-700">{Math.round(q.rate * 100)}%</span>
                      {q.rate < 0.6 && <span className="text-xs text-red-600">偏低</span>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">还没有习题</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
