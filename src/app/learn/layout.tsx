import { cookies } from "next/headers";
import { PW_TIP_COOKIE, getSession, requireStudent } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { ThemePicker } from "@/components/ThemePicker";
import { StudentTabBar } from "@/components/StudentTabBar";
import { PasswordTip } from "./PasswordTip";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStudent();
  // 密码还是学号（登录时记在令牌里）且这次登录没点过“以后再说”时，顶部提醒改密码
  const tip = !!(await getSession())?.wp && (await cookies()).get(PW_TIP_COOKIE)?.value !== "hide";
  return (
    <>
      <TopNav
        name={u.name}
        role="STUDENT"
        tools={<ThemePicker current={u.theme} />}
        links={[{ href: "/learn", label: "我的课程" }, { href: "/learn/grades", label: "我的成绩" }]}
      />
      {tip && <PasswordTip />}
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:pb-6 has-[.lesson-full]:max-w-none">{children}</main>
      <StudentTabBar />
    </>
  );
}
