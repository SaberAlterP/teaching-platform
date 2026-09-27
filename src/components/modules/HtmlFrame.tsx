"use client";
import { useEffect, useRef, useState } from "react";

// 在沙箱 iframe 里运行 HTML 包。
// 包里的页面可以用 postMessage 与平台通信（见 README）：
//   parent.postMessage({ type: "tp:score", score: 80, max: 100, detail: {...} }, "*")  上报成绩
//   parent.postMessage({ type: "tp:complete" }, "*")                                 标记完成
export type FrameMessage =
  | { type: "tp:score"; score: number; max?: number; detail?: unknown }
  | { type: "tp:complete" };

export function HtmlFrame({
  src,
  height,
  onMessage,
}: {
  src: string;
  height: number;
  onMessage?: (m: FrameMessage) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const cb = useRef(onMessage);
  cb.current = onMessage;

  useEffect(() => {
    function handler(e: MessageEvent) {
      // 只接收来自本 iframe 的消息
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== "object" || typeof d.type !== "string") return;
      if (d.type === "tp:score" && typeof d.score === "number" && isFinite(d.score)) cb.current?.(d);
      if (d.type === "tp:complete") cb.current?.(d);
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div ref={wrap} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">加载中…</div>
      )}
      <iframe
        ref={frame}
        src={src}
        onLoad={() => setLoaded(true)}
        style={{ height }}
        className="block w-full"
        // 不给 allow-same-origin：包内代码拿不到平台 Cookie，也不能调用平台接口
        sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads"
        allow="fullscreen; autoplay; accelerometer; gyroscope"
        loading="lazy"
      />
      <button
        type="button"
        onClick={() => wrap.current?.requestFullscreen?.()}
        className="absolute right-2 bottom-2 rounded-md bg-black/50 px-2 py-1 text-xs text-white opacity-60 hover:opacity-100"
      >
        ⛶ 全屏
      </button>
    </div>
  );
}
