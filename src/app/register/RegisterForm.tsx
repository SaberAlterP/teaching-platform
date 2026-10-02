"use client";
import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";

const empty: RegisterState = { error: "", values: { name: "", email: "", username: "" } };

export function RegisterForm({ needsApproval }: { needsApproval: boolean }) {
  const [state, action, pending] = useActionState(registerAction, empty);
  const v = state.values;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">姓名</label>
        <input id="name" name="name" className="input" required autoFocus defaultValue={v.name} placeholder="学生看到的老师姓名" />
      </div>
      <div>
        <label className="label" htmlFor="email">邮箱</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" defaultValue={v.email} placeholder="name@example.com" />
      </div>
      <div>
        <label className="label" htmlFor="username">用户名</label>
        <input id="username" name="username" className="input" required autoComplete="username" defaultValue={v.username} placeholder="3–20 位字母、数字或下划线" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="password">密码</label>
          <input id="password" name="password" type="password" className="input" required minLength={6} autoComplete="new-password" placeholder="至少 6 位" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">确认密码</label>
          <input id="confirm" name="confirm" type="password" className="input" required minLength={6} autoComplete="new-password" />
        </div>
      </div>
      {/* 蜜罐：真人看不到，机器人会填 */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {needsApproval && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">提交后需要管理员批准，批准后即可登录。</p>}
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full py-2.5" disabled={pending}>{pending ? "提交中…" : "注册"}</button>
      <p className="text-center text-sm text-slate-500">
        已有账号？<Link href="/login?as=teacher" className="font-medium text-brand-600 hover:underline">去登录</Link>
      </p>
    </form>
  );
}
