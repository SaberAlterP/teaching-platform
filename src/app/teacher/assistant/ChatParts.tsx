"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Markdown } from "@/components/Markdown";
import { decide, resumeRun, sendMessage, stopRun, undo } from "./actions";

// ---- 与 /api/assistant/chats/[id] 返回的结构对应 ----
export type ToolItem = {
  key: string;
  kind: "tool";
  label: string;
  state: "running" | "ok" | "error" | "rejected" | "aborted";
  error?: string;
  file?: string;
  change?: { id: string; undone: boolean; warn: string };
};
export type Item =
  | { key: string; kind: "user"; text: string; files: string[] }
  | { key: string; kind: "assistant"; text: string; reasoning: string; truncated?: boolean }
  | ToolItem;
type Live = {
  phase: "queued" | "waiting-model" | "thinking" | "writing" | "tool";
  reasoning: string;
  content: string;
  toolName?: string;
  toolChars?: number;
  toolLabel?: string;
  checking?: { file: string; version: number };
  retry?: string;
};
export type Draft = { name: string; size: number; version: number };
export type Poll = {
  title: string;
  status: string;
  error: string;
  pending: { summary: string } | null;
  usage: Record<string, number>;
  next: number;
  items: Item[];
  live: Live | null;
  drafts: Draft[];
};
export type ChatRow = { id: string; title: string; status: string; updatedAt: string };
type Attachment = { id: string; name: string; chars: number; truncated: boolean };

export const ACTIVE = ["queued", "running"];

const TOOL_NAMES: Record<string, string> = {
  html_write: "写动画草稿", html_append: "续写动画草稿", html_edit: "修改动画草稿", create_lesson: "新建课时",
  update_module: "修改模块", add_module: "添加模块", html_publish: "发布动画", update_lesson: "修改课时",
};


// ---- 轮询一个对话的最新状态 ----
export function useChat(chatId: string | null, watch = true) {
  const [items, setItems] = useState<Item[]>([]);
  const [poll, setPoll] = useState<Omit<Poll, "items"> | null>(null);
  const next = useRef(0);
  const watching = useRef(watch);
  useEffect(() => {
    watching.current = watch;
  }, [watch]);

  const refresh = useCallback(
    async (full = false) => {
      if (!chatId) return null;
      const r = await fetch(`/api/assistant/chats/${chatId}?from=${full ? 0 : next.current}${watching.current ? "" : "&watch=0"}`, { cache: "no-store" });
      if (!r.ok) return null;
      const d: Poll = await r.json();
      next.current = d.next;
      setItems((prev) => {
        if (full) return d.items;
        const out = [...prev];
        const at = new Map(out.map((x, i) => [x.key, i]));
        for (const x of d.items) {
          const i = at.get(x.key);
          if (i === undefined) {
            at.set(x.key, out.length);
            out.push(x);
          } else out[i] = x;
        }
        return out;
      });
      setPoll({ ...d, items: undefined } as Omit<Poll, "items">);
      return d;
    },
    [chatId],
  );

  useEffect(() => {
    next.current = 0;
    setItems([]);
    setPoll(null);
    if (!chatId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const d = await refresh().catch(() => null);
      if (stop) return;
      const busy = !d || ACTIVE.includes(d.status) || !!d.live;
      timer = setTimeout(tick, busy ? 1000 : 6000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [chatId, refresh]);

  const active = !!poll && (ACTIVE.includes(poll.status) || !!poll.live);
  return { items, poll, refresh, active };
}
export type ChatState = ReturnType<typeof useChat>;

// ---- 消息区 + 输入框（完整页面和悬浮窗共用）----
export function ChatBody({
  chat,
  chatId,
  lesson,
  hasKey,
  onCreated,
  compact,
}: {
  chat: ChatState;
  chatId: string | null;
  lesson: { id: string; title: string } | null;
  hasKey: boolean;
  onCreated: (id: string) => void;
  compact?: boolean;
}) {
  const { items, poll, refresh, active } = chat;
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // 新内容出现时滚到底部（老师往上翻看时不打扰）
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, poll?.live?.content, poll?.live?.reasoning, poll?.live?.toolChars, poll?.status]);

  function send(content = text) {
    if (!content.trim() && !files.length) return;
    setErr("");
    start(async () => {
      const r = await sendMessage({ chatId: chatId ?? undefined, lessonId: lesson?.id, text: content, attachments: files.map((f) => f.id) });
      if (!("chatId" in r)) {
        setErr(r.error ?? "发送失败");
        return;
      }
      setText("");
      setFiles([]);
      stick.current = true;
      if (!chatId) onCreated(r.chatId);
      else await refresh();
    });
  }

  async function attach(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setErr("");
    for (const f of Array.from(list)) {
      try {
        const r = await fetch(`/api/assistant/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "上传失败");
        setFiles((x) => [...x, d]);
      } catch (e) {
        setErr(`${f.name}：${(e as Error).message}`);
      }
    }
    setUploading(false);
  }

  const act = (fn: () => Promise<{ error?: string } | void>, full = false) =>
    start(async () => {
      setErr("");
      const r = await fn();
      if (r && r.error) setErr(r.error);
      await refresh(full);
    });

  const usage = poll?.usage ?? {};

  return (
    <>
      <div
        ref={scroller}
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${compact ? "px-3 py-3" : "px-4 py-4"}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!hasKey && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            管理员还没有配置 DeepSeek 密钥，AI 暂时不能用，请联系管理员。
          </div>
        )}
        {!chatId && !items.length && <Welcome lesson={lesson} compact={compact} onPick={(s) => setText(s)} />}
        <Messages items={items} busy={active || pending} onUndo={(t) => {
          if (!t.change) return;
          if (!confirm(`撤销「${t.label}」？${t.change.warn}`)) return;
          act(() => undo(chatId!, t.change!.id), true);
        }} />
        {poll?.live && <LiveBlock live={poll.live} />}
        {poll?.pending && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm">
            <div className="font-semibold text-amber-900">需要你确认</div>
            <p className="mt-1 text-amber-900">AI 想要：{poll.pending.summary}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" disabled={pending} onClick={() => act(() => decide(chatId!, true))}>同意</button>
              <button className="btn-outline" disabled={pending} onClick={() => act(() => decide(chatId!, false))}>拒绝</button>
            </div>
          </div>
        )}
        {poll?.status === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {poll.error}
            <button className="btn-outline ml-3 py-1" disabled={pending} onClick={() => act(() => resumeRun(chatId!))}>重试</button>
          </div>
        )}
        {poll?.status === "stopped" && (
          <div className="flex items-center gap-3 text-sm text-slate-500">
            {poll.error || "已停止。"}
            <button className="btn-outline py-1" disabled={pending} onClick={() => act(() => resumeRun(chatId!))}>继续</button>
          </div>
        )}
        {poll?.status === "idle" && poll.error && (
          <div className="flex items-center gap-3 text-sm text-slate-500">
            {poll.error}
            <button className="btn-outline py-1" disabled={pending} onClick={() => act(() => resumeRun(chatId!))}>继续</button>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className={`border-t border-slate-100 ${compact ? "p-2" : "p-3"}`}>
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        {!!files.length && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f) => (
              <span key={f.id} className="badge bg-slate-100 text-slate-700">
                📎 {f.name}（{Math.round(f.chars / 1000)} 千字{f.truncated ? "，已截断" : ""}）
                <button className="ml-1 text-slate-400 hover:text-red-600" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>×</button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (!active) send();
            }
          }}
          rows={compact ? 2 : 3}
          className="input resize-none"
          placeholder={lesson && !chatId ? `告诉 AI 要怎么改《${lesson.title}》…` : "告诉 AI 要做什么…（Ctrl+Enter 发送）"}
        />
        <div className="mt-2 flex items-center gap-2">
          <label className={`btn-ghost cursor-pointer ${compact ? "px-2 py-1" : ""} ${uploading ? "opacity-50" : ""}`}>
            📎 {uploading ? "读取中…" : "附件"}
            <input type="file" multiple className="hidden" accept=".xlsx,.xls,.docx,.pptx,.txt,.md,.csv" disabled={uploading} onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
          </label>
          {!compact && <span className="hidden text-xs text-slate-400 sm:inline">Excel / Word / PPT / 文本</span>}
          {!!usage.requests && (
            <span className={`ml-auto text-xs text-slate-400 ${compact ? "truncate" : "hidden md:inline"}`} title="DeepSeek 按 token 计费">
              {compact ? `用量 ${wan(usage.prompt)} / ${wan(usage.completion)}` : `用量：输入 ${wan(usage.prompt)}（缓存 ${usage.prompt ? Math.round(((usage.cached ?? 0) / usage.prompt) * 100) : 0}%）· 输出 ${wan(usage.completion)} tokens`}
            </span>
          )}
          {active ? (
            <button className={`btn-outline ${usage.requests ? "ml-2" : "ml-auto"}`} onClick={() => act(() => stopRun(chatId!))}>■ 停止</button>
          ) : (
            <button className={`btn-primary ${usage.requests ? "ml-2" : "ml-auto"}`} disabled={pending || uploading || (!text.trim() && !files.length)} onClick={() => send()}>
              {pending ? "发送中…" : "发送"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const wan = (n = 0) => (n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : String(n));

function Welcome({ lesson, compact, onPick }: { lesson: { title: string } | null; compact?: boolean; onPick: (s: string) => void }) {
  const ideas = lesson
    ? [
        "把知识讲解改得更通俗，多举一个岗位里的例子",
        "随堂小测再加两道计算题",
        "给这个课时做一个 2D 互动动画，讲清楚主要流程，最后有 3 道小题",
        "检查这个课时有没有错别字和前后不一致的地方",
      ]
    : [
        "根据附件的大纲，从零建一门课程（先给我方案）",
        "给课时「……」做一个 3D 互动动画",
        "把所有课时的随堂小测检查一遍，找出答案可能有错的题",
        "新建一个课时：……",
      ];
  return (
    <div className={`mx-auto max-w-xl text-center ${compact ? "py-2" : "py-6"}`}>
      <div className="text-lg font-semibold">想让 AI 帮你做什么？</div>
      <p className="mt-1 text-sm text-slate-500">
        它能直接修改课时内容、出题、做 HTML 动画、从零建课。新建的内容都是草稿；改已开放的课时前会先问你；每一步改动都可以撤销。
      </p>
      <div className={`mt-4 grid gap-2 text-left ${compact ? "" : "sm:grid-cols-2"}`}>
        {ideas.map((s) => (
          <button key={s} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 hover:border-brand-500" onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// 连续的工具步骤较多时折叠，只显示最后几步
function Messages({ items, busy, onUndo }: { items: Item[]; busy: boolean; onUndo: (t: ToolItem) => void }) {
  const groups = useMemo(() => {
    const out: (Item | ToolItem[])[] = [];
    for (const x of items) {
      const last = out[out.length - 1];
      if (x.kind === "tool") {
        if (Array.isArray(last)) last.push(x);
        else out.push([x]);
      } else out.push(x);
    }
    return out;
  }, [items]);
  return (
    <>
      {groups.map((g, i) =>
        Array.isArray(g) ? (
          <ToolGroup key={g[0].key} tools={g} busy={busy} onUndo={onUndo} />
        ) : g.kind === "user" ? (
          <div key={g.key} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-4 py-2 text-sm text-white">
              <div className="whitespace-pre-wrap">{g.text}</div>
              {!!g.files.length && <div className="mt-1 text-xs text-brand-100">{g.files.map((f) => `📎 ${f}`).join("　")}</div>}
            </div>
          </div>
        ) : g.kind === "assistant" && (g.text || g.truncated) ? (
          <div key={g.key + i} className="max-w-[92%] text-sm">
            {g.text && <Markdown className="text-[15px]">{g.text}</Markdown>}
            {g.truncated && <div className="text-xs text-amber-600">（这段回复太长，被截断了）</div>}
          </div>
        ) : null,
      )}
    </>
  );
}

function ToolGroup({ tools, busy, onUndo }: { tools: ToolItem[]; busy: boolean; onUndo: (t: ToolItem) => void }) {
  const [open, setOpen] = useState(false);
  const hidden = !open && tools.length > 5 ? tools.length - 3 : 0;
  return (
    <div className="space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-sm">
      {hidden > 0 && (
        <button className="text-xs text-slate-500 hover:text-brand-600" onClick={() => setOpen(true)}>
          ▸ 展开前面 {hidden} 步
        </button>
      )}
      {tools.slice(hidden).map((t) => (
        <div key={t.key} className="flex items-start gap-2">
          <span className="w-4 shrink-0 text-center">
            {t.state === "running" ? <span className="inline-block animate-spin">◌</span> : t.state === "ok" ? <span className="text-emerald-600">✓</span> : t.state === "error" ? <span className="text-amber-600">!</span> : <span className="text-slate-400">✕</span>}
          </span>
          <div className="min-w-0 flex-1">
            <span className={t.change?.undone ? "text-slate-400 line-through" : "text-slate-700"}>{t.label}</span>
            {t.error && <div className="text-xs text-amber-700">{t.error}</div>}
          </div>
          {t.change && (t.change.undone ? (
            <span className="badge shrink-0 bg-slate-200 text-slate-500">已撤销</span>
          ) : (
            <button className="shrink-0 text-xs text-slate-400 hover:text-red-600 disabled:opacity-40" disabled={busy} title={busy ? "AI 工作时不能撤销" : "撤销这一步"} onClick={() => onUndo(t)}>
              撤销
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function LiveBlock({ live }: { live: Live }) {
  const [showThink, setShowThink] = useState(false);
  const text =
    live.phase === "queued" ? "排队中（服务器同时只运行 2 个 AI 任务）…"
    : live.phase === "waiting-model" ? "等待 DeepSeek 响应…"
    : live.phase === "thinking" ? "思考中…"
    : live.phase === "tool" && live.toolChars !== undefined && live.toolName
      ? `正在${TOOL_NAMES[live.toolName] ?? "准备操作"}…（已写 ${Math.round(live.toolChars / 1000)} 千字符）`
    : live.phase === "tool" ? "正在执行…"
    : "";
  return (
    <div className="space-y-1 text-sm">
      {live.content && <Markdown className="text-[15px]">{live.content}</Markdown>}
      {text && (
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          {text}
          {live.phase === "thinking" && live.reasoning && (
            <button className="text-xs text-slate-400 underline" onClick={() => setShowThink(!showThink)}>{showThink ? "收起" : "看看在想什么"}</button>
          )}
        </div>
      )}
      {live.checking && <div className="text-xs text-slate-500">正在右侧预览里运行 {live.checking.file} 检查报错…</div>}
      {live.retry && <div className="text-xs text-amber-600">{live.retry}</div>}
      {showThink && live.phase === "thinking" && (
        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{live.reasoning}</div>
      )}
    </div>
  );
}

// 右侧：草稿动画预览。预览页跑完会把报错交回来，AI 检查草稿时用。
export function Preview({
  chatId,
  drafts,
  checking,
  mobileOpen,
  onClose,
  inline,
}: {
  chatId: string;
  drafts: Draft[];
  checking?: { file: string; version: number };
  mobileOpen?: boolean;
  onClose?: () => void;
  inline?: boolean; // 放在悬浮窗里，不做成侧栏
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [scores, setScores] = useState<number[]>([]);
  const [lastErrors, setLastErrors] = useState<string[] | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // 自动跟随：AI 在检查哪个就看哪个，否则看最近改过的
  const current = (auto && (checking?.file ?? drafts[0]?.name)) || picked || drafts[0]?.name;
  const d = drafts.find((x) => x.name === current);
  const version = d ? Math.max(d.version, checking?.file === current ? checking.version : 0) : 0;
  const src = d ? `/api/assistant/preview/${chatId}/${encodeURIComponent(d.name)}?v=${version}` : "";
  const loaded = useRef({ file: "", version: 0, scores: [] as number[] });

  useEffect(() => {
    loaded.current = { file: current ?? "", version, scores: [] };
    setScores([]);
    setLastErrors(null);
  }, [current, version]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data;
      if (m?.type === "tp:score" && typeof m.score === "number") {
        loaded.current.scores.push(m.score);
        setScores([...loaded.current.scores]);
      }
      if (m?.type === "tp:preview-report") {
        const errors = Array.isArray(m.errors) ? m.errors.map(String) : [];
        setLastErrors(errors);
        const { file, version: v, scores: sc } = loaded.current;
        fetch(`/api/assistant/chats/${chatId}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file, version: v, errors, scores: sc }),
        }).catch(() => {});
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [chatId]);

  return (
    <aside className={inline ? "flex min-h-0 min-w-0 flex-1 flex-col" : `${mobileOpen ? "fixed inset-0 z-40 flex bg-white p-2" : "hidden"} min-w-0 flex-col xl:static xl:flex xl:w-[46%] xl:p-0`}>
      <div className={`${inline ? "" : "card"} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
          <span className="font-medium">动画草稿</span>
          <select
            className="select w-auto max-w-[14rem] py-1"
            value={current ?? ""}
            onChange={(e) => { setPicked(e.target.value); setAuto(false); }}
          >
            {drafts.map((x) => <option key={x.name} value={x.name}>{x.name}（{Math.max(1, Math.round(x.size / 1024))}KB）</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500" title="AI 改动草稿后自动刷新并切换到它正在改的文件">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自动跟随
          </label>
          <div className="ml-auto flex gap-1">
            <button className="btn-ghost px-2 py-1" onClick={() => frame.current && (frame.current.src = src)}>刷新</button>
            {src && <a className="btn-ghost px-2 py-1" href={src} target="_blank" rel="noreferrer">新窗口</a>}
            {!inline && <button className="btn-ghost px-2 py-1 xl:hidden" onClick={onClose}>关闭</button>}
          </div>
        </div>
        {src ? (
          <iframe
            ref={frame}
            key={src}
            src={src}
            sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals"
            allow="fullscreen"
            className="min-h-0 w-full flex-1 bg-white"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">还没有草稿</div>
        )}
        <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
          {lastErrors === null ? "运行中…" : lastErrors.length ? <span className="text-red-600">运行报错：{lastErrors[0]}{lastErrors.length > 1 ? ` 等 ${lastErrors.length} 个` : ""}</span> : "运行正常，没有报错"}
          {!!scores.length && <span className="ml-3 text-emerald-700">成绩上报：{scores.join("、")}</span>}
          <span className="ml-3 text-slate-400">草稿发布到课时后学生才能看到</span>
        </div>
      </div>
    </aside>
  );
}
