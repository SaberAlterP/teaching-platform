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

// 全站统一设置，只有一行（id = global），由管理员维护
const GLOBAL = "global";

export async function getAiSettings() {
  const row = await db.query.aiGlobalSettings.findFirst({ where: eq(schema.aiGlobalSettings.id, GLOBAL) });
  return {
    apiKey: decryptKey(row?.apiKeyEnc ?? ""),
    hasKey: !!row?.apiKeyEnc,
    apiKeyHint: row?.apiKeyHint ?? "",
    model: row?.model || DEFAULT_MODEL,
    baseUrl: row?.baseUrl || DEFAULT_BASE_URL,
    thinking: row?.thinking ?? true,
  };
}

export async function saveAiSettings(patch: { apiKey?: string; model?: string; baseUrl?: string; thinking?: boolean }) {
  const set: Partial<typeof schema.aiGlobalSettings.$inferInsert> = {};
  if (patch.apiKey !== undefined) {
    const k = patch.apiKey.trim();
    set.apiKeyEnc = k ? encryptKey(k) : "";
    set.apiKeyHint = k ? k.slice(0, 6) + "…" + k.slice(-4) : "";
  }
  if (patch.model !== undefined) set.model = patch.model.trim() || DEFAULT_MODEL;
  if (patch.baseUrl !== undefined) set.baseUrl = patch.baseUrl.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
  if (patch.thinking !== undefined) set.thinking = patch.thinking;
  await db
    .insert(schema.aiGlobalSettings)
    .values({ id: GLOBAL, ...set })
    .onConflictDoUpdate({ target: schema.aiGlobalSettings.id, set });
}

export async function recordAiUsage(teacherId: string, chatId: string, model: string, u: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number }) {
  await db.insert(schema.aiUsageLog).values({
    teacherId,
    chatId,
    model,
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    cachedTokens: u.prompt_cache_hit_tokens ?? 0,
  });
}
