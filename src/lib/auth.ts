import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { THEME_COOKIE, isTheme } from "./themes";
import { SESSION_COOKIE, cookieOptions, signSession, verifySession, type SessionPayload } from "./session";

export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

// 同一次页面渲染里 layout 和 page 都要查用户，用 cache 合并成一次数据库查询
const findUser = cache((uid: string) => db.query.users.findFirst({ where: eq(schema.users.id, uid) }));

// 令牌签名有效还不够：用户可能已被删除，或改过密码（旧令牌作废）
async function userFromSession(s: SessionPayload | null) {
  if (!s) return null;
  const user = await findUser(s.uid);
  if (!user || user.sessionVersion !== (s.sv ?? 0)) return null;
  return user;
}

export async function requireUser() {
  const s = await getSession();
  const user = await userFromSession(s);
  if (!user) {
    // 令牌已作废要先清掉，否则中间件看到“有效”令牌又把人送回来。
    // Server Action 里可以直接删 Cookie；页面渲染时不允许改 Cookie（会抛错），就跳到专门清令牌的路由
    if (s) {
      try {
        (await cookies()).delete(SESSION_COOKIE);
      } catch {
        redirect("/api/auth/expired");
      }
    }
    redirect("/login");
  }
  return user;
}

// 给 /api 路由用：和 requireUser 一样查数据库，但不跳转，无效时返回 null（由路由返回 401/403）
export async function getApiUser(role?: "TEACHER" | "STUDENT") {
  const user = await userFromSession(await getSession());
  if (!user || (role && user.role !== role)) return null;
  return user;
}

export async function requireTeacher() {
  const u = await requireUser();
  if (u.role !== "TEACHER") redirect("/learn");
  return u;
}

// 管理员只看数据库里的 is_admin（不放进登录令牌），撤销权限后立即生效
export async function requireAdmin() {
  const u = await requireTeacher();
  if (!u.isAdmin) redirect("/teacher");
  return u;
}

export async function requireStudent() {
  const u = await requireUser();
  if (u.role !== "STUDENT") redirect("/teacher");
  return u;
}

// 教师账号仍在用默认密码时要求首次登录改密码（学生是否要改见下面的 isDefaultStudentPassword）
export const mustChangeNow = (u: schema.User) => u.role === "TEACHER" && u.mustChangePassword;

// 学生的密码还是学号（初始密码或被老师重置过）：别人知道学号就能登录，要求先改密码
export const isDefaultStudentPassword = (u: schema.User, password: string) => u.role === "STUDENT" && password === u.username;

// weakPassword：登录时发现密码还是默认的（只有登录那一刻知道明文），这次登录必须先改密码
export async function startSession(user: schema.User, weakPassword = false) {
  const token = await signSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    mcp: mustChangeNow(user) || weakPassword,
    sv: user.sessionVersion,
  });
  const c = await cookies();
  c.set(SESSION_COOKIE, token, cookieOptions);
  // 主题跟着账号走：登录时写入 Cookie（页面据此换色，登录页也有同样的外观）
  if (user.theme && isTheme(user.theme))
    c.set(THEME_COOKIE, user.theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else c.delete(THEME_COOKIE);
}

export async function endSession() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(THEME_COOKIE);
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// ---- 简单的登录频率限制（内存级，单实例部署足够）----
// 两层：同一来源 + 同一账号错 8 次锁 10 分钟；同一 IP（拿得到真实 IP 时）不管换多少账号，错 30 次锁 10 分钟，
// 防止有人拿“密码 = 学号”挨个学号去试。
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW = 10 * 60 * 1000;
const LIMIT = 8;
const IP_LIMIT = 30;

const limitOf = (key: string) => (key.startsWith("ip:") ? IP_LIMIT : LIMIT);

export function loginBlocked(...keys: string[]): number {
  let wait = 0;
  for (const key of keys) {
    const a = attempts.get(key);
    if (a && a.until >= Date.now() && a.count >= limitOf(key)) wait = Math.max(wait, Math.ceil((a.until - Date.now()) / 60000));
  }
  return wait;
}
export function recordLoginFailure(...keys: string[]) {
  pruneExpired(attempts, (a) => a.until);
  for (const key of keys) {
    const a = attempts.get(key);
    if (!a || a.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + WINDOW });
    else a.count++;
  }
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}

// 内存里的限流记录不清理会一直变多：条目多了就顺手删掉过期的
export function pruneExpired<T>(map: Map<string, T>, until: (v: T) => number) {
  if (map.size < 1000) return;
  const now = Date.now();
  for (const [k, v] of map) if (until(v) < now) map.delete(k);
}
