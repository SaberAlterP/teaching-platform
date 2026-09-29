"use server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { assertLessonOwner, getTeacherCourse } from "@/lib/course";
import { isRunning, sealDangling, startRun, stopChat, type StoredMessage } from "@/lib/ai/agent";
import { ownChat } from "@/lib/ai/chats";
import { streamChat } from "@/lib/ai/deepseek";
import { takeAttachment } from "@/lib/ai/extract";
import { getAiSettings, saveAiSettings } from "@/lib/ai/settings";
import { deleteSkill, saveSkill } from "@/lib/ai/skills";
import { undoChange } from "@/lib/ai/undo";
import { removeChatDir } from "@/lib/ai/workspace";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
const fail = (e: unknown) => ({ error: (e as Error).message || "出错了" });

// 发消息（没有 chatId 时新建对话），然后在后台开始运行
export async function sendMessage(input: { chatId?: string; lessonId?: string; text: string; attachments: string[] }): Promise<Result<{ chatId: string }>> {
  try {
    const t = await requireTeacher();
    const text = input.text.trim();
    const files = [];
    for (const id of input.attachments.slice(0, 5)) {
      const f = await takeAttachment(id);
      if (f) files.push(f);
    }
    if (!text && !files.length) return { error: "请输入内容" };

    let chat;
    if (input.chatId) {
      chat = await ownChat(t.id, input.chatId);
      if (isRunning(chat.id)) return { error: "AI 正在工作，等它做完或先点“停止”" };
    } else {
      let courseId: string;
      let lessonId: string | null = null;
      if (input.lessonId) {
        const l = await assertLessonOwner(input.lessonId, t.id);
        courseId = l.courseId;
        lessonId = l.id;
      } else courseId = (await getTeacherCourse(t.id)).course.id;
      const title = (text || files[0].name).replace(/\s+/g, " ").slice(0, 40);
      [chat] = await db.insert(schema.aiChats).values({ teacherId: t.id, title, courseId, lessonId }).returning();
    }

    const messages = chat.messages as StoredMessage[];
    sealDangling(messages, "老师发了新消息，这个操作没有执行");
    const notes = chat.notes.length ? `（系统提示：${chat.notes.join("；")}）\n\n` : "";
    const content = notes + (text || "请看附件。") + files.map((f) => `\n\n【附件：${f.name}】\n${f.text}`).join("");
    messages.push({ role: "user", content, meta: { at: Date.now(), display: text, files: files.map((f) => f.name) } });
    await db
      .update(schema.aiChats)
      .set({ messages, notes: [], pending: null, decisions: {}, error: "", status: "queued" })
      .where(eq(schema.aiChats.id, chat.id));
    startRun(chat.id);
    return { chatId: chat.id };
  } catch (e) {
    return fail(e);
  }
}

export async function stopRun(chatId: string) {
  const t = await requireTeacher();
  const c = await ownChat(t.id, chatId);
  stopChat(c.id);
  if (!isRunning(c.id) && ["waiting", "queued", "running"].includes(c.status))
    await db.update(schema.aiChats).set({ status: "stopped", pending: null }).where(eq(schema.aiChats.id, c.id));
}

// 出错或中断后接着做
export async function resumeRun(chatId: string): Promise<Result> {
  try {
    const t = await requireTeacher();
    const c = await ownChat(t.id, chatId);
    await db.update(schema.aiChats).set({ status: "queued", error: "", pending: null }).where(eq(schema.aiChats.id, c.id));
    startRun(c.id);
    return {};
  } catch (e) {
    return fail(e);
  }
}

// 老师对“需要确认”的操作点了同意/拒绝
export async function decide(chatId: string, approve: boolean): Promise<Result> {
  try {
    const t = await requireTeacher();
    const c = await ownChat(t.id, chatId);
    if (!c.pending) return { error: "没有等待确认的操作" };
    await db
      .update(schema.aiChats)
      .set({ decisions: { ...c.decisions, [c.pending.toolCallId]: approve ? "approve" : "reject" }, pending: null, status: "queued" })
      .where(eq(schema.aiChats.id, c.id));
    startRun(c.id);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function undo(chatId: string, changeId: string): Promise<Result> {
  try {
    const t = await requireTeacher();
    const c = await ownChat(t.id, chatId);
    if (isRunning(c.id)) return { error: "AI 正在工作，先点“停止”再撤销" };
    await undoChange(t.id, changeId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function deleteChat(chatId: string) {
  const t = await requireTeacher();
  const c = await ownChat(t.id, chatId);
  stopChat(c.id);
  await db.delete(schema.aiChats).where(eq(schema.aiChats.id, c.id));
  await removeChatDir(c.id);
}

export async function renameChat(chatId: string, title: string) {
  const t = await requireTeacher();
  const c = await ownChat(t.id, chatId);
  await db.update(schema.aiChats).set({ title: title.trim().slice(0, 40) || c.title }).where(eq(schema.aiChats.id, c.id));
}

// ---- 设置 ----
export async function saveSettings(input: { apiKey?: string; model: string; baseUrl: string; thinking: boolean }): Promise<Result> {
  try {
    const t = await requireTeacher();
    await saveAiSettings(t.id, input);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function testSettings(): Promise<Result<{ reply: string; model: string }>> {
  try {
    const t = await requireTeacher();
    const s = await getAiSettings(t.id);
    if (!s.apiKey) return { error: "还没有填写密钥" };
    const r = await streamChat({
      baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model, thinking: false, maxTokens: 20,
      messages: [{ role: "user", content: "只回复两个字：你好" }],
      signal: AbortSignal.timeout(30_000),
    });
    return { reply: r.content.trim() || "（收到空回复）", model: s.model };
  } catch (e) {
    return fail(e);
  }
}

// ---- 技能 ----
export async function saveSkillAction(slug: string | null, v: { name: string; description: string; content: string; enabled: boolean }): Promise<Result<{ slug: string }>> {
  try {
    const t = await requireTeacher();
    return { slug: await saveSkill(t.id, slug, v) };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSkillAction(slug: string) {
  const t = await requireTeacher();
  await deleteSkill(t.id, slug);
}
