import "server-only";
import path from "path";
import fs from "fs/promises";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { createId } from "@/lib/id";
import { UPLOAD_DIR } from "@/lib/storage";

// 老师在对话里上传的附件（大纲等）：提取成文字，暂存起来，发消息时附在消息里给 AI。
const DIR = path.join(UPLOAD_DIR, ".ai", "_attach");
export const MAX_ATTACH = 20 * 1024 * 1024;
const MAX_CHARS = 300_000;

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&");

// 文本文件：先按 UTF-8，乱码多时按 GBK（Windows 记事本常见）
function decodeText(buf: Buffer) {
  const utf8 = buf.toString("utf8").replace(/^﻿/, "");
  const bad = (utf8.match(/�/g) ?? []).length;
  if (bad > 5) {
    try {
      return new TextDecoder("gbk").decode(buf);
    } catch {}
  }
  return utf8;
}

async function officeText(buf: Buffer, files: RegExp) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter((n) => files.test(n))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const parts: string[] = [];
  for (const n of names) {
    const xml = await zip.files[n].async("string");
    parts.push(
      decodeXml(
        xml
          .replace(/<w:tab\/>/g, "\t")
          .replace(/<\/(w:p|a:p)>/g, "\n")
          .replace(/<w:br\/>/g, "\n")
          .replace(/<\/w:tc>/g, "\t")
          .replace(/<[^>]+>/g, ""),
      ).replace(/\n{3,}/g, "\n\n"),
    );
  }
  return parts;
}

export async function extractText(buf: Buffer, name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  let text: string;
  if (["txt", "md", "csv", "json", "html", "htm", "tsv"].includes(ext)) text = decodeText(buf);
  else if (["xlsx", "xls", "xlsm"].includes(ext)) {
    const wb = XLSX.read(buf, { type: "buffer" });
    text = wb.SheetNames.map((s) => `## 工作表：${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s], { blankrows: false })}`).join("\n\n");
  } else if (ext === "docx") text = (await officeText(buf, /^word\/document\.xml$/)).join("\n");
  else if (ext === "pptx") text = (await officeText(buf, /^ppt\/slides\/slide\d+\.xml$/)).map((t, i) => `## 第 ${i + 1} 页\n${t}`).join("\n\n");
  else if (ext === "pdf") throw new Error("暂不支持 PDF，请把文字复制出来粘贴到对话里，或另存为 Word 再上传");
  else throw new Error("支持的附件：Excel（xlsx）、Word（docx）、PPT（pptx）、文本（txt/md/csv）");
  text = text.trim();
  if (!text) throw new Error("没有从文件里读到文字");
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS) + "\n…（文件太长，后面的内容已省略）";
  return { text, truncated };
}

export async function saveAttachment(name: string, text: string) {
  const id = createId();
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, id + ".json"), JSON.stringify({ name, text }));
  return id;
}

export async function takeAttachment(id: string): Promise<{ name: string; text: string } | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const p = path.join(DIR, id + ".json");
  try {
    const v = JSON.parse(await fs.readFile(p, "utf8"));
    await fs.rm(p, { force: true });
    return v;
  } catch {
    return null;
  }
}
