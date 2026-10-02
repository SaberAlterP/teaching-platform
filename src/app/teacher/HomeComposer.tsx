"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendMessage } from "./assistant/actions";

const IDEAS = [
  "帮我给本课程新建一个课时大纲",
  "做一个可交互的小动画，讲清楚一个知识点",
  "把我的课件内容整理成课时",
  "给某个课时出几道练习题",
];

// 首页的 AI 对话框：发出第一条消息后，进入 AI 助手的完整对话页继续
export function HomeComposer({ hasKey, isAdmin }: { hasKey: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

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
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-md transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          placeholder="告诉 AI 你想做什么，比如：帮我做一个讲解冷链运输的小动画…"
          className="w-full resize-none bg-transparent px-2 py-1 text-base outline-none placeholder:text-slate-400"
          autoFocus
        />
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="hidden text-xs text-slate-400 sm:inline">Enter 发送 · Shift+Enter 换行</span>
          <button className="btn-primary ml-auto rounded-full px-5" disabled={pending || !text.trim()} onClick={() => send()}>
            {pending ? "正在开始…" : "发送 ↑"}
          </button>
        </div>
      </div>
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      {!hasKey && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          AI 还没有配置密钥，暂时无法对话。{isAdmin ? "请到「管理 → AI 设置」填写 DeepSeek 密钥。" : "请联系管理员配置。"}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {IDEAS.map((i) => (
          <button key={i} className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-sm text-slate-600 transition hover:border-brand-500 hover:text-brand-600" onClick={() => setText(i)}>
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}
