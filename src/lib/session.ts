// 会话令牌（JWT，存在 httpOnly Cookie 中）。此文件可在 middleware（Edge）中使用，不引数据库。
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tp_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 天

export type SessionPayload = {
  uid: string;
  role: "TEACHER" | "STUDENT";
  name: string;
  mcp: boolean; // mustChangePassword
  sv?: number; // 令牌版本，和 users.session_version 不一致就作废（旧令牌没有这个字段，按 0 算）
};

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET 未设置或太短");
  return new TextEncoder().encode(secret);
}

export async function signSession(p: SessionPayload) {
  return new SignJWT(p)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // 部署到 HTTPS 后设置 COOKIE_SECURE=true
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
  maxAge: MAX_AGE,
};
