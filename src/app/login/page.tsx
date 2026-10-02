import { getSignupMode } from "@/lib/site";
import { LoginForm } from "./LoginForm";
import { LoginCarousel } from "./LoginCarousel";

export const metadata = { title: "登录" };

const FEATURES = [
  ["🎬", "3D 动画与虚拟仿真", "把运输、仓储、快递作业搬进屏幕"],
  ["🧩", "边学边练", "每个动画里都有互动小题，做完自动记分"],
  ["📈", "进度成绩一目了然", "学到哪、得了多少分，随时能看"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ as?: string; registered?: string }> }) {
  const sp = await searchParams;
  const signup = await getSignupMode();
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex xl:p-14">
        <LoginCarousel />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-xl font-bold backdrop-blur">L</span>
          <span className="text-xl font-bold tracking-wide">LogiClass</span>
        </div>
        <div className="relative space-y-6 pb-12">
          <div>
            <h2 className="text-4xl leading-tight font-bold drop-shadow xl:text-5xl">动画、仿真与习题<br />一个平台搞定</h2>
            <p className="mt-3 text-lg text-white/85 drop-shadow">让物流与运输的每一个作业环节，都看得见、练得到。</p>
          </div>
          <ul className="grid gap-3 xl:grid-cols-3">
            {FEATURES.map(([icon, title, desc]) => (
              <li key={title} className="rounded-xl bg-black/25 p-3.5 backdrop-blur">
                <div className="font-semibold"><span className="mr-1.5">{icon}</span>{title}</div>
                <div className="mt-1 text-sm text-white/80">{desc}</div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-100 opacity-60 blur-3xl lg:hidden" />
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-brand-100 opacity-60 blur-3xl" />
        <div className="relative w-full max-w-sm">
          <div className="mb-7 text-center lg:text-left">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-2xl font-bold text-white shadow-lg lg:hidden">L</div>
            <h1 className="text-2xl font-bold">欢迎回来</h1>
            <p className="mt-1 text-sm text-slate-500">LogiClass 物流教学实训平台 · 请选择身份登录</p>
          </div>
          <LoginForm initialRole={sp.as === "teacher" || sp.registered ? "teacher" : "student"} canRegister={signup !== "closed"} registered={sp.registered === "pending" ? "pending" : ""} />
        </div>
      </section>
    </main>
  );
}
