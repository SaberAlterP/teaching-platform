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
  // native：浏览器真全屏；page：不支持全屏 API 的设备（如 iPhone）铺满整个页面
  const [full, setFull] = useState<"native" | "page" | null>(null);
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

  useEffect(() => {
    const sync = () => setFull((f) => (document.fullscreenElement === wrap.current ? "native" : f === "native" ? null : f));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (full !== "page") return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFull(null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", esc); };
  }, [full]);

  function toggleFull() {
    if (full === "native") { document.exitFullscreen?.().catch(() => {}); return; }
    if (full === "page") { setFull(null); return; }
    const el = wrap.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFull("page"));
    else setFull("page");
  }

  return (
    <div
      ref={wrap}
      className={
        full
          ? `${full === "page" ? "fixed inset-0 z-50" : "h-full w-full"} relative overflow-hidden bg-white`
          : "relative overflow-hidden rounded-lg border border-slate-200 bg-white"
      }
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">加载中…</div>
      )}
      <iframe
        ref={frame}
        src={src}
        onLoad={() => setLoaded(true)}
        // 全屏时铺满屏幕；平时按宽屏比例尽量占满一屏（至少是老师设置的高度），但不超过窗口高度
        style={full ? { height: "100%" } : { height: `max(${height}px, min(56vw, 100vh - 160px))`, maxHeight: "calc(100vh - 110px)" }}
        className="block w-full"
        // 不给 allow-same-origin：包内代码拿不到平台 Cookie，也不能调用平台接口
        sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads"
        allow="fullscreen; autoplay; accelerometer; gyroscope"
        loading="lazy"
      />
      <button
        type="button"
        onClick={toggleFull}
        className="absolute right-2 bottom-2 rounded-md bg-black/60 px-2.5 py-1.5 text-sm text-white opacity-70 hover:opacity-100"
      >
        {full ? "✕ 退出全屏" : "⛶ 全屏"}
      </button>
    </div>
  );
}
