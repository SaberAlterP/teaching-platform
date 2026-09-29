import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAiSettings } from "@/lib/ai/settings";
import { AiDock } from "./AiDock";

// 课时页面上的 AI 悬浮窗：取这个课时的对话列表
export async function LessonAiDock({ teacherId, lesson }: { teacherId: string; lesson: { id: string; title: string } }) {
  const c = schema.aiChats;
  const [chats, settings] = await Promise.all([
    db
      .select({ id: c.id, title: c.title, status: c.status, updatedAt: c.updatedAt })
      .from(c)
      .where(and(eq(c.teacherId, teacherId), eq(c.lessonId, lesson.id)))
      .orderBy(desc(c.updatedAt))
      .limit(30),
    getAiSettings(teacherId),
  ]);
  return (
    <AiDock
      lesson={lesson}
      hasKey={settings.hasKey}
      chats={chats.map((x) => ({ ...x, updatedAt: x.updatedAt.toISOString() }))}
    />
  );
}
