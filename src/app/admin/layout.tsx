import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireAdmin();
  return (
    <>
      <TopNav
        name={u.name}
        role="TEACHER"
        admin
        links={[
          { href: "/teacher", label: "← 返回教学" },
          { href: "/admin", label: "用量统计" },
          { href: "/admin/teachers", label: "老师与管理员" },
          { href: "/admin/ai", label: "AI 设置" },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
