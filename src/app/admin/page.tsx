import Link from "next/link";
import { loadUsage } from "./usage";

const RANGES = [{ d: 7, label: "近 7 天" }, { d: 30, label: "近 30 天" }, { d: 90, label: "近 90 天" }, { d: 0, label: "全部" }];
const num = (n: number) => n.toLocaleString("zh-CN");
const tok = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : String(n));
const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—");

export const metadata = { title: "管理" };

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const days = RANGES.some((r) => String(r.d) === sp.d) ? Number(sp.d) : 30;
  const { rows, perDay, total } = await loadUsage(days);
  const maxDay = Math.max(1, ...perDay.map((r) => r.prompt + r.completion));
  const cards = [
    { label: "AI 调用次数", v: num(total.calls) },
    { label: "输入 tokens", v: tok(total.prompt), sub: total.prompt ? `缓存命中 ${Math.round((total.cached / total.prompt) * 100)}%` : "" },
    { label: "输出 tokens", v: tok(total.completion) },
    { label: "用过 AI 的老师", v: `${rows.filter((r) => r.calls).length} / ${rows.length}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">AI 用量统计</h1>
        <div className="ml-auto flex gap-1">
          {RANGES.map((r) => (
            <Link key={r.d} href={`/admin?d=${r.d}`} className={r.d === days ? "btn-primary" : "btn-outline"}>{r.label}</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className="mt-1 text-2xl font-bold">{c.v}</div>
            {c.sub && <div className="text-xs text-slate-400">{c.sub}</div>}
          </div>
        ))}
      </div>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">每位老师</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">老师</th><th className="px-2 py-2 text-right">对话数</th><th className="px-2 py-2 text-right">调用次数</th>
              <th className="px-2 py-2 text-right">输入 tokens</th><th className="px-2 py-2 text-right">输出 tokens</th>
              <th className="px-2 py-2 text-right">缓存命中</th><th className="px-4 py-2">最近使用</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {r.name} <span className="text-slate-400">{r.username}</span>
                  {r.isAdmin && <span className="ml-1 badge bg-brand-50 text-brand-600">管理员</span>}
                </td>
                <td className="px-2 py-2 text-right">{r.chats}</td>
                <td className="px-2 py-2 text-right">{num(r.calls)}</td>
                <td className="px-2 py-2 text-right">{num(r.prompt)}</td>
                <td className="px-2 py-2 text-right">{num(r.completion)}</td>
                <td className="px-2 py-2 text-right">{r.prompt ? `${Math.round((r.cached / r.prompt) * 100)}%` : "—"}</td>
                <td className="px-4 py-2 text-slate-500">{fmt(r.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">按日汇总</h2>
        {!perDay.length && <p className="text-sm text-slate-400">这个时间段内还没有 AI 调用记录。</p>}
        <div className="space-y-1.5 text-sm">
          {perDay.map((r) => (
            <div key={r.day} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-slate-500">{r.day}</span>
              <div className="h-4 min-w-0 flex-1 rounded bg-slate-100">
                <div className="h-4 rounded bg-brand-500" style={{ width: `${((r.prompt + r.completion) / maxDay) * 100}%` }} />
              </div>
              <span className="w-56 shrink-0 text-right text-xs text-slate-500">
                {r.calls} 次 · 入 {tok(r.prompt)} · 出 {tok(r.completion)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">日期按北京时间。上线之前的用量按对话汇总，记在对话最后使用的那一天。</p>
      </section>
    </div>
  );
}
