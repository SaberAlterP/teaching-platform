"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkPassword, hashPassword, requireUser, startSession } from "@/lib/auth";

export async function changePasswordAction(_: { error: string }, fd: FormData) {
  const user = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next.length < 6) return { error: "新密码至少 6 位" };
  if (next !== String(fd.get("confirm") ?? "")) return { error: "两次输入的新密码不一致" };
  if (!(await checkPassword(current, user.passwordHash))) return { error: "当前密码不正确" };
  if (next === current) return { error: "新密码不能和原密码相同" };

  const [updated] = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(schema.users.id, user.id))
    .returning();
  await startSession(updated); // 重新签发令牌，清除"需改密码"标记
  redirect(user.role === "TEACHER" ? "/teacher" : "/learn");
}
