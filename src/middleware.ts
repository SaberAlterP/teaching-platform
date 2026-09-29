import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// 路由级权限：未登录跳登录页；老师/学生只能进各自区域；默认密码的教师账号首次登录强制改密码
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const to = (p: string) => NextResponse.redirect(new URL(p, req.url));

  if (pathname === "/login") return s ? to(s.role === "TEACHER" ? "/teacher" : "/learn") : NextResponse.next();
  if (!s) return to("/login");

  if (s.mcp && pathname !== "/account/password") return to("/account/password");
  if (pathname.startsWith("/teacher") && s.role !== "TEACHER") return to("/learn");
  if (pathname.startsWith("/learn") && s.role !== "STUDENT") return to("/teacher");
  if (pathname === "/") return to(s.role === "TEACHER" ? "/teacher" : "/learn");
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/teacher/:path*", "/learn/:path*", "/account/:path*"],
};
