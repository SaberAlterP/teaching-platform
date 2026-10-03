"use server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";

// 看完或跳过新手引导后记一笔，以后不再弹出
export async function finishOnboarding() {
  const t = await requireTeacher();
  await db.update(schema.users).set({ onboarded: true }).where(eq(schema.users.id, t.id));
}
