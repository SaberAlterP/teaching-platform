import { requireAdmin } from "@/lib/auth";
import { count, and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DISK_WARN_PCT, diskUsage } from "@/lib/disk";
import { TopNav } from "@/components/TopNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireAdmin();
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, "TEACHER"), eq(schema.users.approved, false)));
  const disk = await diskUsage();
  const gb = (n: number) => (n / 1024 ** 3).toFixed(1);
  return (
    <>
      <TopNav
        name={u.name}
        role="TEACHER"
        admin
        links={[
          { href: "/teacher", label: "← 返回教学" },
          { href: "/admin", label: "用量统计" },
          { href: "/admin/courses", label: "课程统计" },
          { href: "/admin/teachers", label: "老师与管理员", badge: pending },
          { href: "/admin/ai", label: "AI 设置" },
        ]}
      />
      {disk && disk.usedPct >= DISK_WARN_PCT && (
        <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">
          服务器硬盘已用 {disk.usedPct}%（剩余 {gb(disk.free)} GB / 共 {gb(disk.total)} GB）。硬盘写满网站会无法使用，请尽快清理大视频、旧备份，或扩容硬盘。
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
