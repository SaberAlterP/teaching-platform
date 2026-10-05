import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getApiUser } from "@/lib/auth";
import { getJobMessages, getLive, isRunning, markWatched, type StoredMessage } from "@/lib/ai/agent";
import { viewItems } from "@/lib/ai/view";
import { listDrafts } from "@/lib/ai/workspace";

// AI 助手页面每秒轮询：返回 from 之后的新消息（转换成显示条目）、运行状态、正在生成的内容、草稿文件列表
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getApiUser("TEACHER");
  if (!u) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  const c = schema.aiChats;
  const [chat] = await db
    .select({ id: c.id, title: c.title, status: c.status, error: c.error, pending: c.pending, usage: c.usage })
    .from(c)
    .where(and(eq(c.id, id), eq(c.teacherId, u.id)));
  if (!chat) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  const url = new URL(req.url);
  // watch=0：界面收起了，看不到动画预览，AI 检查草稿时不用等它
  if (url.searchParams.get("watch") !== "0") markWatched(chat.id);
  // 服务器重启后，数据库里还是“运行中”，但实际已经停了
  if (["running", "queued"].includes(chat.status) && !isRunning(chat.id)) {
    chat.status = "stopped";
    chat.error = "服务器重启过，任务中断了，点“继续”接着做";
    await db.update(schema.aiChats).set({ status: chat.status, error: chat.error }).where(eq(schema.aiChats.id, chat.id));
  }
  const from = Math.max(0, Number(url.searchParams.get("from")) || 0);
  const messages =
    getJobMessages(chat.id) ??
    ((await db.select({ m: c.messages }).from(c).where(eq(c.id, chat.id)))[0]?.m as StoredMessage[] | undefined) ??
    [];
  // 从 from 往前多给几条，保证工具调用和结果能对上
  const start = Math.max(0, Math.min(from, messages.length) - 2);
  return NextResponse.json({
    title: chat.title,
    status: chat.status,
    error: chat.error,
    pending: chat.pending,
    usage: chat.usage,
    next: messages.length,
    items: await viewItems(messages, start),
    live: getLive(chat.id),
    drafts: await listDrafts(chat.id),
  });
}
