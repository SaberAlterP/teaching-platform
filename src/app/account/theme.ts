"use server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { THEME_COOKIE, isTheme } from "@/lib/themes";

// 老师和学生都能换主题：存在账号上，登录时写进 Cookie
export async function setTheme(theme: string) {
  const u = await requireUser();
  if (!isTheme(theme)) return;
  await db.update(schema.users).set({ theme }).where(eq(schema.users.id, u.id));
  const c = await cookies();
  if (theme) c.set(THEME_COOKIE, theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else c.delete(THEME_COOKIE);
}
