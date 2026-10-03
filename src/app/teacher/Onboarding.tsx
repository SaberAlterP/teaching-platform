"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishOnboarding } from "./onboarding-action";

const STEPS = [
  { icon: "👋", title: "欢迎来到 LogiClass", body: "几步带你认识工作台。随时可以跳过。", hint: "" },
  { icon: "📚", title: "在「我的课程」建课", body: "首页的每个方块是一门课，点进去管理课时；最后那个「＋」方块可以新建课程。课时先是草稿，学生看不到，确认没问题再开放。", hint: "顶部菜单 → 我的课程" },
  { icon: "✦", title: "让 AI 帮你做课", body: "在首页的输入线里直接说想做什么，比如「根据这份大纲建一门课」「给这个课时做一个小动画」。它能改课时、出题、做互动动画，新建的内容都是草稿，每一步都能撤销。", hint: "顶部菜单 → AI 助手" },
  { icon: "👩‍🎓", title: "学生、批改与成绩", body: "「学生」里导入名单，学号就是初始密码；主观题在「批改」里评分；「成绩统计」看全班掌握情况。", hint: "顶部菜单 → 学生 / 批改 / 成绩统计" },
  { icon: "🎨", title: "换个喜欢的主题", body: "顶部的「🎨 主题」可以换主题色，设置会记在你的账号上。准备好了就开始吧！", hint: "" },
];

// 老师第一次登录时的几步引导；看完或跳过后不再出现
export function Onboarding() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [i, setI] = useState(0);
  const [, start] = useTransition();
  if (!open) return null;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  const done = (to?: string) => {
    setOpen(false);
    start(async () => {
      await finishOnboarding();
      if (to) router.push(to);
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="新手引导">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-3xl text-brand-600">{s.icon}</div>
          <button className="text-sm text-slate-400 hover:text-slate-600" onClick={() => done()}>跳过</button>
        </div>
        <h2 className="mt-4 text-xl font-bold">{s.title}</h2>
        <p className="mt-2 leading-relaxed text-slate-600">{s.body}</p>
        {s.hint && <p className="mt-3 inline-block rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{s.hint}</p>}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-brand-500" : "w-1.5 bg-slate-200"}`} />
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {i > 0 && <button className="btn-ghost" onClick={() => setI(i - 1)}>上一步</button>}
            {last ? (
              <button className="btn-primary" onClick={() => done("/teacher/assistant")}>开始使用 AI</button>
            ) : (
              <button className="btn-primary" onClick={() => setI(i + 1)}>下一步</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
