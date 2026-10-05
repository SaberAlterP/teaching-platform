import path from "path";
import fs from "fs";
import { Readable } from "stream";
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getApiUser } from "@/lib/auth";
import { assetDir } from "@/lib/storage";

// 老师下载 HTML 包：单个 html 原样下载；zip 包把解压后的文件重新打包成 zip
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getApiUser("TEACHER"))) return new Response("无权限", { status: 403 });
  const { id } = await params;
  const asset = await db.query.assets.findFirst({ where: eq(schema.assets.id, id) });
  if (!asset || asset.kind !== "package") return new Response("Not found", { status: 404 });
  const dir = assetDir(id);
  const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`;

  if (!asset.filename.toLowerCase().endsWith(".zip")) {
    const file = path.join(dir, asset.entry);
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat) return new Response("Not found", { status: 404 });
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new Response(stream, {
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(stat.size), "Content-Disposition": disposition },
    });
  }

  const files = await fs.promises.readdir(dir, { recursive: true, withFileTypes: true }).catch(() => null);
  if (!files) return new Response("Not found", { status: 404 });
  const zip = new JSZip();
  for (const f of files) {
    if (!f.isFile()) continue;
    const full = path.join(f.parentPath, f.name);
    // 边读边压缩，不把整个包读进内存
    zip.file(path.relative(dir, full).split(path.sep).join("/"), fs.createReadStream(full));
  }
  const out = zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" });
  return new Response(Readable.toWeb(out as Readable) as ReadableStream, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": disposition },
  });
}
