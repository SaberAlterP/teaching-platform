import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { SESSION_COOKIE, cookieOptions, signSession, verifySession, type SessionPayload } from "./session";

export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

// 同一次页面渲染里 layout 和 page 都要查用户，用 cache 合并成一次数据库查询
const findUser = cache((uid: string) => db.query.users.findFirst({ where: eq(schema.users.id, uid) }));

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  // 令牌有效但用户可能已被删除
  const user = await findUser(s.uid);
  if (!user) redirect("/login");
  return user;
}

export async function requireTeacher() {
  const u = await requireUser();
  if (u.role !== "TEACHER") redirect("/learn");
  return u;
}

export async function requireStudent() {
  const u = await requireUser();
  if (u.role !== "STUDENT") redirect("/teacher");
  return u;
}

// 学生不强制改密码（初始密码就是学号）；只有仍在用默认密码的教师账号才要求首次登录改密码
export const mustChangeNow = (u: schema.User) => u.role === "TEACHER" && u.mustChangePassword;

export async function startSession(user: schema.User) {
  const token = await signSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    mcp: mustChangeNow(user),
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// ---- 简单的登录频率限制（内存级，单实例部署足够）----
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW = 10 * 60 * 1000;
const LIMIT = 8;

export function loginBlocked(key: string): number {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) return 0;
  return a.count >= LIMIT ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}
export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + WINDOW });
  else a.count++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
