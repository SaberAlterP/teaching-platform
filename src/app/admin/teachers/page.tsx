import { requireAdmin } from "@/lib/auth";
import { loadTeacherOverview } from "../usage";
import { AdminToggle } from "./TeacherRow";

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "从未登录");

export default async function TeachersPage() {
  const me = await requireAdmin();
  const rows = await loadTeacherOverview();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">老师与管理员</h1>
        <p className="mt-1 text-sm text-slate-500">管理员同时仍是老师，可以照常上课、改课；比普通老师多了 AI 设置和用量统计。</p>
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">老师</th><th className="px-2 py-2 text-right">课程</th><th className="px-2 py-2 text-right">课时</th>
              <th className="px-2 py-2">最近登录</th><th className="px-4 py-2">身份</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{t.name} <span className="text-slate-400">{t.username}</span></td>
                <td className="px-2 py-2 text-right">{t.courses}</td>
                <td className="px-2 py-2 text-right">{t.lessons}</td>
                <td className="px-2 py-2 text-slate-500">{fmt(t.lastLoginAt)}</td>
                <td className="px-4 py-2">
                  {t.isAdmin && <span className="mr-2 badge bg-brand-50 text-brand-600">管理员</span>}
                  <AdminToggle id={t.id} isAdmin={t.isAdmin} self={t.id === me.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
