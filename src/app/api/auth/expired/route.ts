import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// 登录令牌签名还有效、但已作废（改过密码、账号被删）时，页面跳到这里：清掉令牌再去登录页。
// 不能直接跳 /login：中间件只校验签名，会把仍“有效”的令牌又送回原页面，形成死循环。
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
