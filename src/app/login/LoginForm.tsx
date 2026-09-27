"use client";
import { useActionState, useState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  const [username, setUsername] = useState(""); // 受控，避免登录失败后表单被清空
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">账号</label>
        <input id="username" name="username" className="input" autoComplete="username" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">密码</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
