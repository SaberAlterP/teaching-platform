import "server-only";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// AI 接口密钥：格式 tpk_ + 43 位随机字符。数据库只存 SHA-256 哈希。
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function createApiKey(teacherId: string, name: string) {
  const key = "tpk_" + randomBytes(32).toString("base64url");
  await db.insert(schema.apiKeys).values({ teacherId, name, keyHash: hash(key), prefix: key.slice(0, 10) });
  return key;
}

// 从请求头 Authorization: Bearer <密钥> 取出老师；无效返回 null
export async function teacherFromRequest(req: Request) {
  const m = /^Bearer\s+(tpk_[A-Za-z0-9_-]+)$/.exec(req.headers.get("authorization")?.trim() ?? "");
  if (!m) return null;
  const [row] = await db
    .select({ key: schema.apiKeys, user: schema.users })
    .from(schema.apiKeys)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiKeys.teacherId))
    .where(eq(schema.apiKeys.keyHash, hash(m[1])));
  if (!row || row.user.role !== "TEACHER") return null;
  // 最近使用时间，一分钟内只写一次
  if (!row.key.lastUsedAt || Date.now() - row.key.lastUsedAt.getTime() > 60_000)
    await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.key.id));
  return row.user;
}
