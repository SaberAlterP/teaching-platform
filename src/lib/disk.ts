import "server-only";
import fs from "fs/promises";
import { UPLOAD_DIR } from "@/lib/storage";

// 上传目录所在硬盘的使用情况（容器里的上传卷和服务器共用同一块盘）
export async function diskUsage() {
  try {
    const s = await fs.statfs(UPLOAD_DIR);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, free, usedPct: total ? Math.round(((total - free) / total) * 100) : 0 };
  } catch {
    return null;
  }
}

export const DISK_WARN_PCT = 80;
