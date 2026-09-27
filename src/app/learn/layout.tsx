import { requireStudent } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStudent();
  return (
    <>
      <TopNav name={u.name} role="STUDENT" links={[{ href: "/learn", label: "我的课程" }, { href: "/learn/grades", label: "我的成绩" }]} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
