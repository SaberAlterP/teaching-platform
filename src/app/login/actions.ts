"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  checkPassword, clearLoginFailures, endSession, loginBlocked, recordLoginFailure, startSession,
} from "@/lib/auth";

export async function loginAction(_: { error: string }, fd: FormData) {
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  // 只有部署在反向代理后面（TRUST_PROXY=true）时才信任 X-Forwarded-For，否则按账号限流
  const ip = process.env.TRUST_PROXY === "true"
    ? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "direct"
    : "direct";
  const key = `${ip}:${username}`;

  const wait = loginBlocked(key);
  if (wait) return { error: `尝试次数过多，请 ${wait} 分钟后再试` };

  const user = await db.query.users.findFirst({ where: eq(schema.users.username, username) });
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    recordLoginFailure(key);
    return { error: "账号或密码错误" };
  }
  clearLoginFailures(key);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await startSession(user);
  redirect(user.mustChangePassword ? "/account/password" : user.role === "TEACHER" ? "/teacher" : "/learn");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
