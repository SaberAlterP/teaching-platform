"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteChat } from "./actions";
import { ACTIVE, ChatBody, Preview, useChat, type ChatRow } from "./ChatParts";

export function ChatClient({
  chatId,
  lesson,
  hasKey,
  chats,
}: {
  chatId: string | null;
  lesson: { id: string; title: string } | null;
  hasKey: boolean;
  chats: ChatRow[];
}) {
  const router = useRouter();
  const chat = useChat(chatId);
  const { poll, active } = chat;
  const [, start] = useTransition();
  const [showList, setShowList] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // 运行结束时刷新左侧对话列表（状态点）
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active) router.refresh();
    wasActive.current = active;
  }, [active, router]);

  const drafts = poll?.drafts ?? [];

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* 对话列表 */}
      <aside className={`${showList ? "fixed inset-0 z-40 flex bg-black/30 p-3" : "hidden"} lg:static lg:flex lg:w-56 lg:shrink-0 lg:bg-transparent lg:p-0`} onClick={() => setShowList(false)}>
        <div className="card flex w-64 flex-col overflow-hidden lg:w-full" onClick={(e) => e.stopPropagation()}>
          <Link href="/teacher/assistant" className="btn-primary m-2">＋ 新对话</Link>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {chats.map((c) => (
              <div key={c.id} className={`group flex items-center rounded-lg text-sm ${c.id === chatId ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100"}`}>
                <Link href={`/teacher/assistant?c=${c.id}`} className="min-w-0 flex-1 truncate px-2 py-1.5" title={c.title}>
                  {ACTIVE.includes(c.status) && <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
                  {c.status === "waiting" && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />}
                  {c.title}
                </Link>
                <button
                  className="hidden px-1.5 text-slate-400 hover:text-red-600 group-hover:block"
                  title="删除对话"
                  onClick={() => {
                    if (!confirm(`删除对话「${c.title}」？已经做好的课程内容不受影响，但这次对话的改动就不能再撤销了。`)) return;
                    start(async () => {
                      await deleteChat(c.id);
                      if (c.id === chatId) router.push("/teacher/assistant");
                      else router.refresh();
                    });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {!chats.length && <p className="px-2 py-4 text-center text-xs text-slate-400">还没有对话</p>}
          </div>
        </div>
      </aside>

      {/* 对话 */}
      <section className="card flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm">
          <button className="btn-ghost px-2 py-1 lg:hidden" onClick={() => setShowList(true)}>☰</button>
          <span className="truncate font-medium">{poll?.title ?? (lesson ? `修改课时：${lesson.title}` : "新对话")}</span>
          {lesson && (
            <Link href={`/teacher/lessons/${lesson.id}`} className="badge shrink-0 bg-slate-100 text-slate-600 hover:bg-slate-200" title="打开课时编辑页">
              课时：{lesson.title.slice(0, 16)}
            </Link>
          )}
          <button className={`btn-ghost ml-auto px-2 py-1 xl:hidden ${drafts.length ? "" : "hidden"}`} onClick={() => setShowPreview(true)}>
            预览（{drafts.length}）
          </button>
        </div>

        <ChatBody chat={chat} chatId={chatId} lesson={lesson} hasKey={hasKey} onCreated={(id) => router.replace(`/teacher/assistant?c=${id}`)} />
      </section>

      {/* 动画预览 */}
      {chatId && (drafts.length > 0 || showPreview) && (
        <Preview chatId={chatId} drafts={drafts} checking={poll?.live?.checking} mobileOpen={showPreview} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

