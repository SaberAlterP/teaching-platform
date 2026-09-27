import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-xl font-bold text-white">
            实
          </div>
          <h1 className="text-2xl font-bold">教学实训平台</h1>
          <p className="mt-1 text-sm text-slate-500">学生请使用学号登录</p>
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
