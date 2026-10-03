"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendMessage } from "./assistant/actions";

const IDEAS = [
  "新建一个课时大纲",
  "做一个讲清知识点的小动画",
  "把课件整理成课时",
  "给课时出几道练习题",
];

// 首页入口：问候语加一条输入线，没有卡片和底框。发出第一条消息后进入 AI 助手的完整对话
export function HomeComposer({ name, greeting, hasKey, isAdmin }: { name: string; greeting: string; hasKey: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  // 输入框随内容长高（最多 6 行）
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  const send = (t = text) => {
    if (!t.trim() || pending) return;
    setErr("");
    start(async () => {
      const r = await sendMessage({ text: t, attachments: [] });
      if (r.error !== undefined) setErr(r.error);
      else router.push(`/teacher/assistant?c=${r.chatId}`);
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {greeting}，<span className="text-brand-600">{name}</span>
        <span className="ml-1 text-slate-400">· 接下来想做点什么？</span>
      </h1>

      <div className="group mt-5 flex items-end gap-3 border-b-2 border-slate-200 pb-2 text-left transition focus-within:border-brand-500">
        <span className="pb-1 text-xl text-brand-500" aria-hidden>✦</span>
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="告诉 AI 你想做什么，比如：帮我做一个讲解冷链运输的小动画"
          className="min-h-8 flex-1 resize-none bg-transparent py-1 text-lg outline-none placeholder:text-slate-400"
          aria-label="告诉 AI 你想做什么"
        />
        <button
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400"
          disabled={pending || !text.trim()}
          onClick={() => send()}
          aria-label="发送"
          title="发送（Enter）"
        >
          {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : "↑"}
        </button>
      </div>

      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-left text-sm text-red-600">{err}</p>}
      {!hasKey && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-700">
          AI 还没有配置密钥，暂时无法对话。{isAdmin ? "请到「管理 → AI 设置」填写 DeepSeek 密钥。" : "请联系管理员配置。"}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-sm text-slate-400">
        <span>试试：</span>
        {IDEAS.map((i, n) => (
          <button key={i} className={`rounded-full px-2.5 py-1 text-slate-500 transition hover:bg-brand-50 hover:text-brand-600 ${n > 1 ? "hidden sm:inline" : ""}`} onClick={() => { setText(i); box.current?.focus(); }}>
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}
