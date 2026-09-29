import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getAiSettings } from "@/lib/ai/settings";
import { AssistantTabs } from "./AssistantTabs";
import { ChatClient } from "./ChatClient";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; lesson?: string }> }) {
  const t = await requireTeacher();
  const sp = await searchParams;
  const [chats, settings] = await Promise.all([
    db
      .select({ id: schema.aiChats.id, title: schema.aiChats.title, status: schema.aiChats.status, updatedAt: schema.aiChats.updatedAt })
      .from(schema.aiChats)
      .where(eq(schema.aiChats.teacherId, t.id))
      .orderBy(desc(schema.aiChats.updatedAt))
      .limit(100),
    getAiSettings(t.id),
  ]);
  const current = sp.c && chats.some((c) => c.id === sp.c) ? sp.c : null;
  // 从课时编辑页进来：新对话默认针对这个课时
  let lesson: { id: string; title: string } | null = null;
  const lessonId = current
    ? (await db.query.aiChats.findFirst({ where: and(eq(schema.aiChats.id, current), eq(schema.aiChats.teacherId, t.id)) }))?.lessonId
    : sp.lesson;
  if (lessonId) {
    const [row] = await db
      .select({ id: schema.lessons.id, title: schema.lessons.title })
      .from(schema.lessons)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
      .where(and(eq(schema.lessons.id, lessonId), eq(schema.courses.teacherId, t.id)));
    lesson = row ?? null;
  }

  return (
    <div className="lesson-full mx-auto flex h-[calc(100dvh-6.5rem)] max-w-[1800px] flex-col gap-3">
      <AssistantTabs />
      <ChatClient
        key={current ?? "new:" + (lesson?.id ?? "")}
        chatId={current}
        lesson={lesson}
        hasKey={settings.hasKey}
        chats={chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
      />
    </div>
  );
}
