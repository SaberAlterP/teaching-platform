"use client";
import { useEffect, useState } from "react";

// 登录页左侧轮播：用已做好的 3D 动画截取的画面（不新做、不跑 3D，只是几张图），慢慢推近 + 渐变切换
const SLIDES = [
  { src: "/login/s1.jpg", title: "集装箱码头作业链" },
  { src: "/login/s2.jpg", title: "冷链运输与月台作业" },
  { src: "/login/s3.jpg", title: "分拨中心自动分拣" },
  { src: "/login/s4.jpg", title: "航空货物打板与装载" },
  { src: "/login/s5.jpg", title: "平陆运河省水船闸" },
];

export function LoginCarousel() {
  const [i, setI] = useState(0);
  const [ready, setReady] = useState(1); // 已经开始加载的张数：先只加载第一张，页面可操作后再按顺序加载其余
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => setI((n) => (n + 1) % SLIDES.length), reduce ? 8000 : 5500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (ready >= SLIDES.length) return;
    const t = setTimeout(() => setReady((r) => r + 1), ready === 1 ? 1200 : 600);
    return () => clearTimeout(t);
  }, [ready]);
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {SLIDES.slice(0, Math.max(ready, i + 1)).map((s, k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={s.src}
          src={s.src}
          alt=""
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${k === i ? "opacity-100" : "opacity-0"}`}
          style={k === i ? { animation: "tp-kenburns 9s ease-out forwards" } : undefined}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-brand-700/85 via-brand-600/25 to-brand-700/55" />
      <div className="absolute right-10 bottom-8 left-10 flex items-center gap-3 text-sm text-white/90 xl:right-14 xl:left-14">
        <span>{SLIDES[i].title}</span>
        <span className="ml-auto flex gap-1.5">
          {SLIDES.map((s, k) => (
            <i key={s.src} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-white" : "w-1.5 bg-white/45"}`} />
          ))}
        </span>
      </div>
    </div>
  );
}
