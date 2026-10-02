import { requireAdmin } from "@/lib/auth";
import { count, and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { TopNav } from "@/components/TopNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireAdmin();
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, "TEACHER"), eq(schema.users.approved, false)));
  return (
    <>
      <TopNav
        name={u.name}
        role="TEACHER"
        admin
        links={[
          { href: "/teacher", label: "← 返回教学" },
          { href: "/admin", label: "用量统计" },
          { href: "/admin/teachers", label: "老师与管理员", badge: pending },
          { href: "/admin/ai", label: "AI 设置" },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
