import { randomBytes } from "crypto";

// 短随机 ID（URL 安全）
export function createId(): string {
  return randomBytes(12).toString("base64url");
}
