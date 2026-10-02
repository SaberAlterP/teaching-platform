"use client";
import { useEffect } from "react";

export type Cheer = { id: number; icon: string; title: string; sub: string };

// 做完题或拿到成绩时弹出的小徽章 + 彩纸（纯 CSS，3 秒后自动消失）
export function Celebration({ cheer, onClose }: { cheer: Cheer | null; onClose: () => void }) {
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [cheer, onClose]);
  if (!cheer) return null;
  const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444"];
  return (
    <div key={cheer.id} className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 sm:bottom-10" role="status">
      <div className="relative">
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          const d = 70 + (i % 3) * 28;
          return (
            <i
              key={i}
              className="absolute top-1/2 left-1/2 block h-2 w-1.5 rounded-sm"
              style={{
                background: colors[i % colors.length],
                ["--dx" as string]: `${Math.cos(a) * d}px`,
                ["--dy" as string]: `${Math.sin(a) * d - 30}px`,
                ["--rot" as string]: `${i * 53}deg`,
                animation: "tp-confetti 1.3s ease-out forwards",
              }}
            />
          );
        })}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-xl" style={{ animation: "tp-pop .45s ease-out" }}>
          <span className="text-4xl" aria-hidden>{cheer.icon}</span>
          <div>
            <div className="font-bold text-slate-800">{cheer.title}</div>
            <div className="text-sm text-slate-500">{cheer.sub}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 按得分率给徽章
export function cheerForScore(score: number, max: number, what: string, id: number): Cheer {
  const r = max > 0 ? score / max : 0;
  const n = Number.isInteger(score) ? score : score.toFixed(1);
  if (r >= 0.9) return { id, icon: "🥇", title: "优秀！", sub: `${what} ${n}/${max} 分` };
  if (r >= 0.6) return { id, icon: "🥈", title: "不错哦", sub: `${what} ${n}/${max} 分` };
  return { id, icon: "💪", title: "再接再厉", sub: `${what} ${n}/${max} 分，可以再试一次` };
}
