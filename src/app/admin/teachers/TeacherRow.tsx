"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAdmin } from "../actions";

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
