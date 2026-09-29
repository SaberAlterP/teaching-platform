import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function ownChat(teacherId: string, chatId: string) {
  const c = await db.query.aiChats.findFirst({ where: and(eq(schema.aiChats.id, chatId), eq(schema.aiChats.teacherId, teacherId)) });
  if (!c) throw new Error("对话不存在");
  return c;
}
