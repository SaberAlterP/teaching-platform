"use server";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
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
  if (next === user.username) return { error: "新密码不能和账号（学号）相同" };

  // 令牌版本加 1：其他设备上的旧登录全部失效（比如密码被别人猜到过）
  const [updated] = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, user.id))
    .returning();
  await startSession(updated); // 重新签发令牌（新版本号），清除"需改密码"标记
  redirect(user.role === "TEACHER" ? "/teacher" : "/learn");
}
