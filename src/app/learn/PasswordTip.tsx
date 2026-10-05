"use client";
import { useState } from "react";
import Link from "next/link";

// 学生的密码还是学号时，学习页顶部的提醒。不强制：点“以后再说”这次登录就不再出现，下次登录再提醒。
export function PasswordTip() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mx-auto mt-4 max-w-7xl px-4">
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="flex-1 min-w-[12rem]">🔒 你的密码还是学号，知道你学号的同学都能登录你的账号。建议花半分钟改一个只有你知道的密码。</span>
        <span className="flex gap-2">
          <Link href="/account/password" className="btn-primary px-3 py-1.5">去改密码</Link>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-amber-700"
            onClick={() => {
              document.cookie = "tp_pwtip=hide; path=/; samesite=lax";
              setHidden(true);
            }}
          >
            以后再说
          </button>
        </span>
      </div>
    </div>
  );
}
