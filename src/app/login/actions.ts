"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  checkPassword, clearLoginFailures, endSession, loginBlocked, mustChangeNow, recordLoginFailure, startSession,
} from "@/lib/auth";

export async function loginAction(_: { error: string }, fd: FormData) {
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const as = fd.get("as") === "teacher" ? "teacher" : "student";
  // 只有部署在反向代理后面（TRUST_PROXY=true）时才信任 X-Forwarded-For，否则按账号限流
  const ip = process.env.TRUST_PROXY === "true"
    ? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "direct"
    : "direct";
  const key = `${ip}:${username}`;

  const wait = loginBlocked(key);
  if (wait) return { error: `尝试次数过多，请 ${wait} 分钟后再试` };

  // 老师可以用邮箱登录
  const user = await db.query.users.findFirst({
    where: as === "teacher"
      ? or(eq(schema.users.username, username), eq(schema.users.email, username.toLowerCase()))
      : eq(schema.users.username, username),
  });
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    recordLoginFailure(key);
    return { error: "账号或密码错误" };
  }
  // 密码对了才提示身份不符，避免被人拿来探测账号
  if (user.role === "TEACHER" && as !== "teacher") return { error: "这是老师账号，请切换到上面的「我是老师」登录" };
  if (user.role === "STUDENT" && as !== "student") return { error: "这是学生账号，请切换到上面的「我是学生」登录" };
  if (!user.approved) return { error: "账号还在等待管理员批准，批准后就能登录了" };
  clearLoginFailures(key);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await startSession(user);
  redirect(mustChangeNow(user) ? "/account/password" : user.role === "TEACHER" ? "/teacher" : "/learn");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
