"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatBody, Preview, useChat, type ChatRow } from "./ChatParts";

// 课时编辑页 / 预览页右侧的 AI 悬浮窗：边看边说，AI 改完页面立即刷新。
// 四种状态：停靠右侧（可拉宽）、浮动窗口（可拖动、可拉伸）、放大、收起成右边的小标签。

type Mode = "docked" | "floating" | "max" | "closed";
type Rect = { x: number; y: number; w: number; h: number };
type Saved = { mode: Mode; last: Mode; dockW: number; rect: Rect };

const KEY = "tp-ai-dock";
const MIN_W = 320;
const MIN_H = 360;
const WIDE = 1024; // 这个宽度以上停靠时把页面往左挤，窄屏直接盖在上面

const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
};
const store = (v: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function fit(r: Rect): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = clamp(r.w, MIN_W, vw - 16);
  const h = clamp(r.h, MIN_H, vh - 16);
  return { w, h, x: clamp(r.x, 8, vw - w - 8), y: clamp(r.y, 8, vh - h - 8) };
}

export function AiDock({ lesson, chats, hasKey }: { lesson: { id: string; title: string }; chats: ChatRow[]; hasKey: boolean }) {
  const router = useRouter();
  const [ui, setUi] = useState<Saved | null>(null); // 读取本地设置前不渲染，避免闪一下
  const [chatId, setChatId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // ---- 初始化：上次的窗口状态、这个课时上次用的对话 ----
  useEffect(() => {
    const s = load();
    const vw = window.innerWidth;
    setUi({
      mode: s?.mode ?? "closed",
      last: s?.last && s.last !== "closed" ? s.last : vw >= WIDE ? "docked" : "floating",
      dockW: s?.dockW ?? Math.min(440, Math.round(vw * 0.4)),
      rect: fit(s?.rect ?? { x: vw - 480, y: 72, w: 460, h: Math.min(680, window.innerHeight - 100) }),
    });
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(`${KEY}:${lesson.id}`);
    } catch {}
    setChatId(chats.some((c) => c.id === remembered) ? remembered : (chats[0]?.id ?? null));
    // 只在进入页面时决定用哪个对话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const update = useCallback((patch: Partial<Saved>) => {
    setUi((u) => {
      if (!u) return u;
      const next = { ...u, ...patch };
      if (patch.mode && patch.mode !== "closed") next.last = patch.mode === "max" ? u.last : patch.mode;
      store(next);
      return next;
    });
  }, []);

  function pick(id: string | null) {
    setChatId(id);
    try {
      if (id) localStorage.setItem(`${KEY}:${lesson.id}`, id);
      else localStorage.removeItem(`${KEY}:${lesson.id}`);
    } catch {}
  }

  const mode = ui?.mode ?? "closed";
  const chat = useChat(chatId, mode !== "closed");
  const { items, poll, active } = chat;
  const drafts = poll?.drafts ?? [];
  const checking = poll?.live?.checking;

  // ---- AI 每改一步（或撤销）就刷新页面内容 ----
  const seen = useRef<{ chat: string | null; sig: string | null }>({ chat: null, sig: null });
  useEffect(() => {
    if (!poll) return;
    const sig = items
      .filter((x) => x.kind === "tool" && x.change)
      .map((x) => (x.kind === "tool" && x.change ? `${x.change.id}:${x.change.undone}` : ""))
      .join(",");
    const prev = seen.current;
    seen.current = { chat: chatId, sig };
    if (prev.chat === chatId && prev.sig !== null && prev.sig !== sig) router.refresh();
  }, [items, poll, chatId, router]);
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active) router.refresh();
    wasActive.current = active;
  }, [active, router]);

  // AI 要检查动画时把预览展开，预览要看得见才能跑出报错
  useEffect(() => {
    if (checking) setShowPreview(true);
  }, [checking]);

  // ---- 停靠在右侧时，把页面内容往左挤 ----
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const dockW = ui ? clamp(ui.dockW, MIN_W, Math.max(MIN_W, vw - 360)) : 0;
  const pushes = mode === "docked" && vw >= WIDE;
  useEffect(() => {
    document.body.style.paddingRight = pushes ? `${dockW}px` : "";
    return () => {
      document.body.style.paddingRight = "";
    };
  }, [pushes, dockW]);
  // 窗口大小变了，浮动窗口别跑出屏幕
  useEffect(() => {
    if (ui && vw) {
      const r = fit(ui.rect);
      if (r.x !== ui.rect.x || r.y !== ui.rect.y || r.w !== ui.rect.w || r.h !== ui.rect.h) update({ rect: r });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vw]);

  // 课时侧栏的“让 AI 改这个课时”按钮会发这个事件
  useEffect(() => {
    const open = () => setUi((u) => (u && u.mode === "closed" ? (store({ ...u, mode: u.last }), { ...u, mode: u.last }) : u));
    window.addEventListener("tp:ai-dock-open", open);
    return () => window.removeEventListener("tp:ai-dock-open", open);
  }, []);

  // ---- 拖动：移动窗口、拉伸边缘 ----
  function drag(e: React.PointerEvent, move: (dx: number, dy: number, start: Saved) => Partial<Saved>) {
    if (!ui || e.button !== 0) return;
    e.preventDefault();
    const start = ui;
    const sx = e.clientX;
    const sy = e.clientY;
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      const p = move(ev.clientX - sx, ev.clientY - sy, start);
      setUi((u) => (u ? { ...u, ...p } : u));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(false);
      setUi((u) => {
        if (u) store(u);
        return u;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  const moveWindow = (e: React.PointerEvent) => {
    if (mode !== "floating" || (e.target as HTMLElement).closest("button,select,a,input")) return;
    drag(e, (dx, dy, s) => ({ rect: fit({ ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy }) }));
  };
  // 八个方向拉伸浮动窗口
  const resizeFloat = (dir: string) => (e: React.PointerEvent) =>
    drag(e, (dx, dy, s) => {
      let { x, y, w, h } = s.rect;
      if (dir.includes("e")) w = s.rect.w + dx;
      if (dir.includes("s")) h = s.rect.h + dy;
      if (dir.includes("w")) {
        w = Math.max(MIN_W, s.rect.w - dx);
        x = s.rect.x + s.rect.w - w;
      }
      if (dir.includes("n")) {
        h = Math.max(MIN_H, s.rect.h - dy);
        y = s.rect.y + s.rect.h - h;
      }
      return { rect: fit({ x, y, w, h }) };
    });

  if (!ui) return null;

  const current = chats.find((c) => c.id === chatId);
  const alert = poll?.pending ? "amber" : active ? "green" : null;

  // ---- 收起：右边一个小标签 ----
  if (mode === "closed")
    return (
      <button
        onClick={() => update({ mode: ui.last })}
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-xl bg-brand-500 px-2 py-3 text-sm font-medium text-white shadow-lg hover:bg-brand-600"
        title="打开 AI 助手"
      >
        <span>✨</span>
        <span className="leading-tight">AI</span>
        <span className="leading-tight">改</span>
        <span className="leading-tight">课</span>
        {alert && <span className={`h-2.5 w-2.5 rounded-full ${alert === "amber" ? "bg-amber-300" : "animate-pulse bg-emerald-300"}`} />}
      </button>
    );

  const style: React.CSSProperties =
    mode === "docked" ? { top: 0, right: 0, bottom: 0, width: vw < WIDE ? Math.min(dockW, vw) : dockW }
    : mode === "max" ? { inset: 12 }
    : { left: ui.rect.x, top: ui.rect.y, width: ui.rect.w, height: ui.rect.h };

  const btn = "rounded-md px-1.5 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800";
  return (
    <>
      {/* 拖动时盖一层，防止鼠标被 iframe 吃掉 */}
      {dragging && <div className="fixed inset-0 z-[60] cursor-grabbing select-none" />}
      <div
        style={style}
        className={`fixed z-50 flex flex-col overflow-hidden bg-white ${mode === "docked" ? "border-l border-slate-200 shadow-xl" : "rounded-xl border border-slate-200 shadow-2xl"}`}
      >
        {/* 标题栏 */}
        <div
          onPointerDown={moveWindow}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest("button,select,a,input")) update({ mode: mode === "max" ? ui.last : "max" });
          }}
          className={`flex shrink-0 items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-sm ${mode === "floating" ? "cursor-move" : ""}`}
        >
          <span className="px-1 font-semibold">✨ AI</span>
          <select
            className="select min-w-0 flex-1 py-1 text-xs"
            value={chatId ?? ""}
            onChange={(e) => pick(e.target.value || null)}
            title={current?.title}
          >
            <option value="">＋ 新对话</option>
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.status === "running" || c.status === "queued" ? "● " : c.status === "waiting" ? "◐ " : ""}
                {c.title}
              </option>
            ))}
          </select>
          <button className={btn} title="新对话" onClick={() => pick(null)}>＋</button>
          <Link className={btn} title="在完整页面打开" href={chatId ? `/teacher/assistant?c=${chatId}` : `/teacher/assistant?lesson=${lesson.id}`}>↗</Link>
          <span className="mx-0.5 h-4 w-px bg-slate-200" />
          {mode !== "docked" && <button className={btn} title="停靠到右侧" onClick={() => update({ mode: "docked" })}>⇥</button>}
          {mode !== "floating" && <button className={btn} title="浮动窗口（可拖动、拉伸）" onClick={() => update({ mode: "floating" })}>⧉</button>}
          {mode === "max" ? (
            <button className={btn} title="还原" onClick={() => update({ mode: ui.last })}>🗗</button>
          ) : (
            <button className={btn} title="放大" onClick={() => update({ mode: "max" })}>⤢</button>
          )}
          <button className={btn} title="收起" onClick={() => update({ mode: "closed" })}>—</button>
        </div>

        {/* 动画草稿预览 */}
        {chatId && drafts.length > 0 && (
          <div className={`flex shrink-0 flex-col border-b border-slate-200 ${showPreview ? "h-[45%] min-h-48" : ""}`}>
            {showPreview ? (
              <>
                <Preview chatId={chatId} drafts={drafts} checking={checking} inline />
                <button className="shrink-0 border-t border-slate-100 py-0.5 text-xs text-slate-400 hover:bg-slate-50" onClick={() => setShowPreview(false)}>
                  ▴ 收起动画预览
                </button>
              </>
            ) : (
              <button className="py-1 text-xs text-slate-500 hover:bg-slate-50" onClick={() => setShowPreview(true)}>
                ▾ 动画草稿预览（{drafts.length}）
              </button>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <ChatBody
            chat={chat}
            chatId={chatId}
            lesson={lesson}
            hasKey={hasKey}
            compact
            onCreated={(id) => {
              pick(id);
              router.refresh(); // 更新对话下拉列表
            }}
          />
        </div>

        {/* 拉伸手柄 */}
        {mode === "docked" && (
          <div
            onPointerDown={(e) => drag(e, (dx, _dy, s) => ({ dockW: clamp(s.dockW - dx, MIN_W, window.innerWidth - 360) }))}
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-brand-500/30"
            title="拖动调整宽度"
          />
        )}
        {mode === "floating" && (
          <>
            <div onPointerDown={resizeFloat("n")} className="absolute inset-x-3 top-0 h-1.5 cursor-ns-resize" />
            <div onPointerDown={resizeFloat("s")} className="absolute inset-x-3 bottom-0 h-1.5 cursor-ns-resize" />
            <div onPointerDown={resizeFloat("w")} className="absolute inset-y-3 left-0 w-1.5 cursor-ew-resize" />
            <div onPointerDown={resizeFloat("e")} className="absolute inset-y-3 right-0 w-1.5 cursor-ew-resize" />
            <div onPointerDown={resizeFloat("nw")} className="absolute left-0 top-0 h-3 w-3 cursor-nwse-resize" />
            <div onPointerDown={resizeFloat("ne")} className="absolute right-0 top-0 h-3 w-3 cursor-nesw-resize" />
            <div onPointerDown={resizeFloat("sw")} className="absolute bottom-0 left-0 h-3 w-3 cursor-nesw-resize" />
            <div onPointerDown={resizeFloat("se")} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize">
              <svg viewBox="0 0 10 10" className="h-full w-full text-slate-300"><path d="M9 3 3 9M9 6 6 9" stroke="currentColor" strokeWidth="1.2" /></svg>
            </div>
          </>
        )}
      </div>
    </>
  );
}
