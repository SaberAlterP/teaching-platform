import { getSession, mustChangeNow, requireUser } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";

export default async function PasswordPage() {
  const user = await requireUser();
  // 学生用默认密码（学号）登录时，登录令牌里带着“需改密码”标记
  const weak = !mustChangeNow(user) && !!(await getSession())?.mcp;
  const forced = mustChangeNow(user) || weak;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">修改密码</h1>
        <p className="mt-1 mb-5 text-sm text-slate-500">
          {weak
            ? `${user.name}，你的密码还是学号，知道学号的人都能登录你的账号。请先设置一个新密码。`
            : forced ? `${user.name}，首次登录请先设置新密码。` : `${user.name}，在这里修改你的密码。`}
        </p>
        <PasswordForm back={forced ? null : user.role === "TEACHER" ? "/teacher" : "/learn"} />
      </div>
    </main>
  );
}
