"use client";
import { useActionState } from "react";
import Link from "next/link";
import { changePasswordAction } from "./actions";

export function PasswordForm({ back }: { back: string | null }) {
  const [state, action, pending] = useActionState(changePasswordAction, { error: "" });
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">当前密码</label>
        <input name="current" type="password" className="input" required autoComplete="current-password" />
      </div>
      <div>
        <label className="label">新密码（至少 6 位）</label>
        <input name="next" type="password" className="input" required minLength={6} autoComplete="new-password" />
      </div>
      <div>
        <label className="label">再次输入新密码</label>
        <input name="confirm" type="password" className="input" required minLength={6} autoComplete="new-password" />
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending}>{pending ? "保存中…" : "保存"}</button>
        {back && <Link href={back} className="btn-outline">返回</Link>}
      </div>
    </form>
  );
}
