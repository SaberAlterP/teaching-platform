import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">修改密码</h1>
        <p className="mt-1 mb-5 text-sm text-slate-500">
          {user.mustChangePassword ? `${user.name}，首次登录请先设置新密码。` : `${user.name}，在这里修改你的密码。`}
        </p>
        <PasswordForm back={user.mustChangePassword ? null : user.role === "TEACHER" ? "/teacher" : "/learn"} />
      </div>
    </main>
  );
}
