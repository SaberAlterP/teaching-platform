"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, pruneExpired, startSession } from "@/lib/auth";
import { getSignupMode } from "@/lib/site";

// 简单限流：同一来源 1 小时内最多注册 5 次（内存级，单实例够用）
const tries = new Map<string, { n: number; until: number }>();

export type RegisterState = { error: string; values: { name: string; email: string; username: string } };

export async function registerAction(_: RegisterState, fd: FormData): Promise<RegisterState> {
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const values = { name, email, username };
  const fail = (error: string): RegisterState => ({ error, values });

  const mode = await getSignupMode();
  if (mode === "closed") return fail("目前不开放老师注册，请联系管理员");
  if (fd.get("website")) return fail("提交失败，请重试"); // 蜜罐字段：机器人才会填

  if (name.length < 2 || name.length > 20) return fail("姓名请填 2–20 个字");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) return fail("邮箱格式不正确");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail("用户名为 3–20 位字母、数字或下划线");
  if (password.length < 6) return fail("密码至少 6 位");
  if (password !== String(fd.get("confirm") ?? "")) return fail("两次输入的密码不一致");

  const ip = process.env.TRUST_PROXY === "true"
    ? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "direct"
    : "direct";
  const t = tries.get(ip);
  if (t && t.until > Date.now() && t.n >= 5) return fail("注册太频繁了，请稍后再试");

  const dup = await db.query.users.findFirst({
    where: or(eq(schema.users.username, username), eq(schema.users.email, email)),
  });
  if (dup) return fail(dup.username === username ? "这个用户名已被使用" : "这个邮箱已经注册过了");

  const approved = mode === "open";
  const [user] = await db
    .insert(schema.users)
    .values({ username, name, email, passwordHash: await hashPassword(password), role: "TEACHER", mustChangePassword: false, approved })
    .returning();
  pruneExpired(tries, (x) => x.until);
  tries.set(ip, t && t.until > Date.now() ? { n: t.n + 1, until: t.until } : { n: 1, until: Date.now() + 3600_000 });

  if (!approved) redirect("/login?registered=pending");
  await startSession(user);
  redirect("/teacher");
}
