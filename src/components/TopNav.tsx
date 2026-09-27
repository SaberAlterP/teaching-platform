import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { NavLinks } from "./NavLinks";

export function TopNav({
  name,
  role,
  links,
}: {
  name: string;
  role: "TEACHER" | "STUDENT";
  links: { href: string; label: string; badge?: number }[];
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:gap-6">
        <Link href={role === "TEACHER" ? "/teacher" : "/learn"} className="flex items-center gap-2 font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-sm text-white">实</span>
          <span className="hidden sm:inline">教学实训平台</span>
        </Link>
        <NavLinks links={links} />
        <div className="ml-auto flex shrink-0 items-center gap-1 text-sm">
          <span className="mr-2 hidden text-slate-500 sm:inline">
            {name}
            <span className="ml-1.5 badge bg-slate-100 text-slate-600">{role === "TEACHER" ? "教师" : "学生"}</span>
          </span>
          <Link href="/account/password" className="btn-ghost">改密码</Link>
          <form action={logoutAction}>
            <button className="btn-ghost">退出</button>
          </form>
        </div>
      </div>
    </header>
  );
}
