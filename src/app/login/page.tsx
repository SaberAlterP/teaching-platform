import { getSignupMode } from "@/lib/site";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ as?: string; registered?: string }> }) {
  const sp = await searchParams;
  const signup = await getSignupMode();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-100 opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-brand-100 opacity-60 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-2xl font-bold text-white shadow-lg">
            实
          </div>
          <h1 className="text-2xl font-bold">教学实训平台</h1>
          <p className="mt-1 text-sm text-slate-500">动画、仿真与习题，一个平台搞定</p>
        </div>
        <LoginForm initialRole={sp.as === "teacher" || sp.registered ? "teacher" : "student"} canRegister={signup !== "closed"} registered={sp.registered === "pending" ? "pending" : ""} />
      </div>
    </main>
  );
}
