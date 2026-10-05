import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getApiUser } from "@/lib/auth";
import { assetDir } from "@/lib/storage";

// 普通文件下载（需登录）。支持 Range 请求，视频可以拖动进度条。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getApiUser())) return new Response("未登录", { status: 401 });
  const { id } = await params;
  const asset = await db.query.assets.findFirst({ where: eq(schema.assets.id, id) });
  if (!asset || asset.kind !== "file") return new Response("Not found", { status: 404 });

  const file = path.join(assetDir(id), "file");
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": asset.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
  };
  // 防止上传的 HTML/SVG 以平台身份执行脚本
  if (/html|svg|xml/.test(asset.mime)) headers["Content-Security-Policy"] = "sandbox";

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? parseInt(range[1]) : 0;
    const end = range[2] ? Math.min(parseInt(range[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(stat.size) } });
}
