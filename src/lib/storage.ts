import "server-only";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import JSZip from "jszip";
import { eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");
export const MAX_FILE = 200 * 1024 * 1024; // 图片/视频单文件 200MB（边收边写硬盘，不占内存）
export const MAX_PACKAGE = 100 * 1024 * 1024; // HTML 包 100MB（zip 解压需要读进内存）
const MAX_UNZIPPED = 500 * 1024 * 1024; // zip 解压后总大小上限，防止"压缩炸弹"
const TMP_DIR = path.join(UPLOAD_DIR, ".tmp");
export const UNDO_DAYS = 14; // AI 助手的改动在这么多天内可以撤销

export function assetDir(id: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("bad id");
  return path.join(UPLOAD_DIR, id);
}

// 防止 ../ 穿越到上传目录外
export function safeJoin(base: string, rel: string) {
  const p = path.resolve(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error("bad path");
  return p;
}

// 把上传的数据流直接写到临时文件，超过大小限制立即中止
async function receive(body: ReadableStream<Uint8Array>, limit: number) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const tmp = path.join(TMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > limit) cb(new Error(`文件超过 ${Math.round(limit / 1024 / 1024)}MB`));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as import("stream/web").ReadableStream), counter, createWriteStream(tmp));
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  return { tmp, size };
}

export async function saveFile(body: ReadableStream<Uint8Array>, filename: string, mime: string) {
  const { tmp, size } = await receive(body, MAX_FILE);
  try {
    const [row] = await db
      .insert(schema.assets)
      .values({ kind: "file", filename, mime: mime && mime !== "application/octet-stream" ? mime : guessMime(filename), size, entry: "file" })
      .returning();
    const dir = assetDir(row.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(tmp, path.join(dir, "file"));
    return row;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

// HTML 包：单个 .html 文件，或包含 index.html 的 .zip
export async function savePackage(body: ReadableStream<Uint8Array>, filename: string) {
  const lower = filename.toLowerCase();
  const isHtml = lower.endsWith(".html") || lower.endsWith(".htm");
  if (!isHtml && !lower.endsWith(".zip")) throw new Error("请上传 .html 文件或 .zip 压缩包");
  const { tmp, size } = await receive(body, MAX_PACKAGE);
  let dir = "";
  try {
    if (isHtml) {
      const row = await insertPackage(filename, size, "index.html");
      dir = assetDir(row.id);
      await fs.mkdir(dir, { recursive: true });
      await fs.rename(tmp, path.join(dir, "index.html"));
      return row;
    }

    const zip = await JSZip.loadAsync(await fs.readFile(tmp));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !n.startsWith("__MACOSX/"));
    // 如果 zip 里整体包了一层文件夹，自动去掉
    const prefix = commonPrefix(names);
    const entries = names
      .map((n) => ({ n, rel: n.slice(prefix.length) }))
      .filter((x) => x.rel && !x.rel.includes(".."));
    const htmls = entries.map((x) => x.rel).filter((r) => /\.html?$/i.test(r));
    const entry = htmls.find((r) => r.toLowerCase() === "index.html") ?? htmls.sort((a, b) => a.length - b.length)[0];
    if (!entry) throw new Error("zip 包里没有找到 html 文件");
    // 先按 zip 目录里记录的解压后大小检查一遍，避免把一个巨大的文件整个解压进内存后才发现超限
    if (declaredUnzippedSize(entries.map((x) => zip.files[x.n])) > MAX_UNZIPPED) throw new Error("zip 解压后太大（超过 500MB）");

    const row = await insertPackage(filename, size, entry);
    dir = assetDir(row.id);
    // 一个一个解压写盘，内存里同时只放一个文件
    let total = 0;
    for (const x of entries) {
      const data = await zip.files[x.n].async("nodebuffer");
      total += data.length;
      if (total > MAX_UNZIPPED) throw new Error("zip 解压后太大（超过 500MB）");
      const p = safeJoin(dir, x.rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, data);
    }
    return row;
  } catch (e) {
    // 失败时把已经写了一半的包删掉（数据库记录没有模块引用，会被自动清理）
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    throw e;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

async function insertPackage(filename: string, size: number, entry: string) {
  const [row] = await db
    .insert(schema.assets)
    .values({ kind: "package", filename, mime: "text/html", size, entry })
    .returning();
  return row;
}

// 清理没有任何模块再引用的上传文件（删除模块/课时、替换图片视频后留下的）。
// 只删上传超过 1 小时的，避免误删老师刚上传、还没保存进模块的文件。
// 注意：课时删除后，它导出的 JSON 里引用的文件也会被清理，重新导入后需要重新上传。
export async function cleanupOrphanAssets() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const old = await db.select({ id: schema.assets.id }).from(schema.assets).where(lt(schema.assets.createdAt, cutoff));
  if (!old.length) return 0;
  const rows = await db.select({ data: sql<string>`${schema.modules.data}::text` }).from(schema.modules);
  // AI 助手改动记录里的旧版本也算引用（撤销时要用），只看可撤销期限内的
  const kept = await db
    .select({ data: sql<string>`coalesce(${schema.aiChanges.before}::text, '') || coalesce(${schema.aiChanges.after}::text, '')` })
    .from(schema.aiChanges)
    .where(sql`${schema.aiChanges.undone} = false and ${schema.aiChanges.createdAt} > now() - interval '${sql.raw(String(UNDO_DAYS))} days'`);
  const all = [...rows, ...kept].map((r) => r.data).join("\n");
  const orphans = old.filter((a) => !all.includes(a.id));
  for (const a of orphans) {
    await db.delete(schema.assets).where(eq(schema.assets.id, a.id));
    await fs.rm(assetDir(a.id), { recursive: true, force: true });
  }
  return orphans.length;
}

// zip 目录里记录的解压后总大小（JSZip 没有公开这个字段；读不到时按 0 算，解压时还有逐个文件的累计检查兜底）
export function declaredUnzippedSize(files: JSZip.JSZipObject[]) {
  let total = 0;
  for (const f of files) {
    const n = (f as unknown as { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize;
    if (typeof n === "number" && n > 0) total += n;
  }
  return total;
}

function commonPrefix(names: string[]) {
  if (!names.length) return "";
  const first = names[0].split("/");
  if (first.length < 2) return "";
  const top = first[0] + "/";
  return names.every((n) => n.startsWith(top)) ? top : "";
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml",
  webp: "image/webp", ico: "image/x-icon", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
  wav: "audio/wav", ogg: "audio/ogg", glb: "model/gltf-binary", gltf: "model/gltf+json",
  wasm: "application/wasm", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
};
export function guessMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}
