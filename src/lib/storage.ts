import "server-only";
import path from "path";
import fs from "fs/promises";
import JSZip from "jszip";
import { db, schema } from "@/db";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");
export const MAX_FILE = 200 * 1024 * 1024; // 单文件 200MB

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

export async function saveFile(file: File) {
  if (file.size > MAX_FILE) throw new Error("文件超过 200MB");
  const [row] = await db
    .insert(schema.assets)
    .values({ kind: "file", filename: file.name, mime: file.type || guessMime(file.name), size: file.size, entry: "file" })
    .returning();
  const dir = assetDir(row.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "file"), Buffer.from(await file.arrayBuffer()));
  return row;
}

// HTML 包：单个 .html 文件，或包含 index.html 的 .zip
export async function savePackage(file: File) {
  if (file.size > MAX_FILE) throw new Error("文件超过 200MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const lower = file.name.toLowerCase();
  const files: { rel: string; data: Buffer }[] = [];
  let entry = "index.html";

  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    files.push({ rel: "index.html", data: buf });
  } else if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !n.startsWith("__MACOSX/"));
    // 如果 zip 里整体包了一层文件夹，自动去掉
    const prefix = commonPrefix(names);
    for (const n of names) {
      const rel = n.slice(prefix.length);
      if (!rel || rel.includes("..")) continue;
      files.push({ rel, data: await zip.files[n].async("nodebuffer") });
    }
    const htmls = files.map((f) => f.rel).filter((r) => /\.html?$/i.test(r));
    entry = htmls.find((r) => r.toLowerCase() === "index.html") ?? htmls.sort((a, b) => a.length - b.length)[0];
    if (!entry) throw new Error("zip 包里没有找到 html 文件");
  } else {
    throw new Error("请上传 .html 文件或 .zip 压缩包");
  }

  const [row] = await db
    .insert(schema.assets)
    .values({ kind: "package", filename: file.name, mime: "text/html", size: file.size, entry })
    .returning();
  const dir = assetDir(row.id);
  for (const f of files) {
    const p = safeJoin(dir, f.rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, f.data);
  }
  return row;
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
