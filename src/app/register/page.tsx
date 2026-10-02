import Link from "next/link";
import { getSignupMode } from "@/lib/site";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const mode = await getSignupMode();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-100 opacity-60 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-2xl font-bold text-white shadow-lg">实</div>
          <h1 className="text-2xl font-bold">注册新老师</h1>
          <p className="mt-1 text-sm text-slate-500">创建账号后，就能建课、做动画、管理学生</p>
        </div>
        <div className="card p-6">
          {mode === "closed" ? (
            <div className="space-y-3 py-4 text-center text-sm text-slate-600">
              <p>目前不开放老师注册，请联系管理员为你开通账号。</p>
              <Link href="/login?as=teacher" className="btn-outline">返回登录</Link>
            </div>
          ) : (
            <RegisterForm needsApproval={mode === "approval"} />
          )}
        </div>
      </div>
    </main>
  );
}
