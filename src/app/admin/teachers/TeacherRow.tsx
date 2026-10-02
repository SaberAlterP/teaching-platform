"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewTeacher, saveSignupMode, setAdmin } from "../actions";
import type { SignupMode } from "@/lib/site";

export function AdminToggle({ id, isAdmin, self }: { id: string; isAdmin: boolean; self: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const go = () => {
    if (isAdmin && self && !confirm("取消自己的管理员身份后，你将无法再进入管理页面。确定吗？")) return;
    start(async () => {
      const r = await setAdmin(id, !isAdmin);
      setErr(r.error ?? "");
      router.refresh();
    });
  };
  return (
    <span>
      <button className={isAdmin ? "btn-outline" : "btn-primary"} disabled={pending} onClick={go}>
        {isAdmin ? "取消管理员" : "设为管理员"}
      </button>
      {err && <span className="ml-2 text-xs text-red-600">{err}</span>}
    </span>
  );
}

export function ReviewButtons({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (ok: boolean) => {
    if (!ok && !confirm("拒绝后这个账号会被删除，确定吗？")) return;
    start(async () => {
      await reviewTeacher(id, ok);
      router.refresh();
    });
  };
  return (
    <span className="flex gap-2">
      <button className="btn-primary" disabled={pending} onClick={() => go(true)}>批准</button>
      <button className="btn-outline" disabled={pending} onClick={() => go(false)}>拒绝</button>
    </span>
  );
}

const MODES: { key: SignupMode; label: string; hint: string }[] = [
  { key: "approval", label: "需管理员批准", hint: "注册后要你批准才能登录（推荐）" },
  { key: "open", label: "直接开通", hint: "注册后立即可用，任何人都能注册" },
  { key: "closed", label: "关闭注册", hint: "登录页不再显示注册入口" },
];

export function SignupModeSelect({ mode }: { mode: SignupMode }) {
  const router = useRouter();
  const [cur, setCur] = useState(mode);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {MODES.map((m) => (
        <button
          key={m.key}
          disabled={pending}
          onClick={() => {
            setCur(m.key);
            start(async () => {
              await saveSignupMode(m.key);
              router.refresh();
            });
          }}
          className={`rounded-lg border p-3 text-left text-sm transition ${cur === m.key ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
        >
          <div className="font-medium">{m.label}</div>
          <div className="mt-0.5 text-xs text-slate-500">{m.hint}</div>
        </button>
      ))}
    </div>
  );
}
