"use server";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getAiSettings, saveAiSettings } from "@/lib/ai/settings";
import { streamChat } from "@/lib/ai/deepseek";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
const fail = (e: unknown) => ({ error: (e as Error).message || "出错了" });

export async function saveSettings(input: { apiKey?: string; model: string; baseUrl: string; thinking: boolean }): Promise<Result> {
  try {
    await requireAdmin();
    await saveAiSettings(input);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function testSettings(): Promise<Result<{ reply: string; model: string }>> {
  try {
    await requireAdmin();
    const s = await getAiSettings();
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

export async function setAdmin(teacherId: string, isAdmin: boolean): Promise<Result> {
  try {
    await requireAdmin();
    if (!isAdmin) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(schema.users)
        .where(and(eq(schema.users.isAdmin, true), eq(schema.users.role, "TEACHER")));
      if (n <= 1) return { error: "至少要保留一位管理员" };
    }
    await db
      .update(schema.users)
      .set({ isAdmin })
      .where(and(eq(schema.users.id, teacherId), eq(schema.users.role, "TEACHER")));
    revalidatePath("/admin/teachers");
    return {};
  } catch (e) {
    return fail(e);
  }
}
