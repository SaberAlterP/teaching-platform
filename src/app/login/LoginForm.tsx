"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction } from "./actions";

type Role = "student" | "teacher";

export function LoginForm({ initialRole, canRegister, registered }: { initialRole: Role; canRegister: boolean; registered: "" | "pending" }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  const [username, setUsername] = useState(""); // 受控，避免登录失败后表单被清空
  const [hideErr, setHideErr] = useState(false); // 切换身份后先藏起上一次的报错
  const teacher = role === "teacher";
  const tab = (r: Role, label: string, icon: string) => (
    <button
      type="button"
      onClick={() => { setRole(r); setHideErr(true); }}
      className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${role === r ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
    >
      <span className="mr-1">{icon}</span>{label}
    </button>
  );
  return (
    <div className="card p-6">
      <div className="mb-5 flex rounded-xl bg-slate-100 p-1">
        {tab("student", "我是学生", "🎓")}
        {tab("teacher", "我是老师", "📖")}
      </div>
      {registered === "pending" && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">注册成功！账号需要管理员批准后才能登录，请耐心等待。</p>
      )}
      <form action={action} onSubmit={() => setHideErr(false)} className="space-y-4">
        <input type="hidden" name="as" value={role} />
        <div>
          <label className="label" htmlFor="username">{teacher ? "用户名或邮箱" : "学号"}</label>
          <input
            id="username" name="username" className="input" autoComplete="username" required autoFocus
            placeholder={teacher ? "老师的用户名或注册邮箱" : "请输入学号"}
            value={username} onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">密码</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required placeholder={teacher ? "" : "初始密码就是学号"} />
        </div>
        {state.error && !hideErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={pending}>
          {pending ? "登录中…" : teacher ? "老师登录" : "学生登录"}
        </button>
      </form>
      {teacher && canRegister && (
        <p className="mt-4 text-center text-sm text-slate-500">
          还没有账号？<Link href="/register" className="font-medium text-brand-600 hover:underline">注册新老师</Link>
        </p>
      )}
    </div>
  );
}
