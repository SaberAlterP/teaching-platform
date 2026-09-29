import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// DeepSeek 密钥加密保存：AES-256-GCM，密钥由 AUTH_SECRET 派生。
// 更换 AUTH_SECRET 后旧密钥解不开，老师在设置页重新填写即可。
const secret = () => createHash("sha256").update("tp-ai:" + (process.env.AUTH_SECRET ?? "")).digest();

export function encryptKey(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptKey(stored: string) {
  if (!stored) return "";
  try {
    const [iv, tag, enc] = stored.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", secret(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export const DEFAULT_MODEL = "deepseek-flash";
export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const MODEL_SUGGESTIONS = ["deepseek-flash", "deepseek-v4-pro"];

export async function getAiSettings(teacherId: string) {
  const row = await db.query.aiSettings.findFirst({ where: eq(schema.aiSettings.teacherId, teacherId) });
  return {
    apiKey: decryptKey(row?.apiKeyEnc ?? ""),
    hasKey: !!row?.apiKeyEnc,
    apiKeyHint: row?.apiKeyHint ?? "",
    model: row?.model || DEFAULT_MODEL,
    baseUrl: row?.baseUrl || DEFAULT_BASE_URL,
    thinking: row?.thinking ?? true,
  };
}

export async function saveAiSettings(
  teacherId: string,
  patch: { apiKey?: string; model?: string; baseUrl?: string; thinking?: boolean },
) {
  const set: Partial<typeof schema.aiSettings.$inferInsert> = {};
  if (patch.apiKey !== undefined) {
    const k = patch.apiKey.trim();
    set.apiKeyEnc = k ? encryptKey(k) : "";
    set.apiKeyHint = k ? k.slice(0, 6) + "…" + k.slice(-4) : "";
  }
  if (patch.model !== undefined) set.model = patch.model.trim() || DEFAULT_MODEL;
  if (patch.baseUrl !== undefined) set.baseUrl = patch.baseUrl.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
  if (patch.thinking !== undefined) set.thinking = patch.thinking;
  await db
    .insert(schema.aiSettings)
    .values({ teacherId, ...set })
    .onConflictDoUpdate({ target: schema.aiSettings.teacherId, set });
}
