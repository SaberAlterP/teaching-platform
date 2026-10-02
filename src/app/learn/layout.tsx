import { requireStudent } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { ThemePicker } from "@/components/ThemePicker";
import { StudentTabBar } from "@/components/StudentTabBar";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStudent();
  return (
    <>
      <TopNav
        name={u.name}
        role="STUDENT"
        tools={<ThemePicker current={u.theme} />}
        links={[{ href: "/learn", label: "我的课程" }, { href: "/learn/grades", label: "我的成绩" }]}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:pb-6 has-[.lesson-full]:max-w-none">{children}</main>
      <StudentTabBar />
    </>
  );
}
