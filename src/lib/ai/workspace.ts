import "server-only";
import path from "path";
import fs from "fs/promises";
import vm from "vm";
import { UPLOAD_DIR } from "@/lib/storage";

// AI 写 HTML 动画用的草稿区：每个对话一个目录，写完预览、检查，再发布成课时里的 HTML 包。
const ROOT = path.join(UPLOAD_DIR, ".ai");
export const MAX_DRAFT = 8 * 1024 * 1024;

export function chatDir(chatId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(chatId)) throw new Error("bad chat id");
  return path.join(ROOT, chatId);
}

// 文件名只允许字母数字、中文、-_，以 .html 结尾，不能带目录
export function draftPath(chatId: string, name: string) {
  if (!/^[\p{L}\p{N}_-]{1,60}\.html$/u.test(name)) throw new Error(`文件名不合法：${name}（只能用字母、数字、中文、-、_，以 .html 结尾）`);
  return path.join(chatDir(chatId), name);
}

export async function readDraft(chatId: string, name: string) {
  try {
    return await fs.readFile(draftPath(chatId, name), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`草稿 ${name} 不存在，先用 html_write 创建`);
    throw e;
  }
}

export async function writeDraft(chatId: string, name: string, content: string) {
  if (Buffer.byteLength(content) > MAX_DRAFT) throw new Error("草稿超过 8MB");
  const p = draftPath(chatId, name);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
  return draftInfo(chatId, name);
}

export async function draftInfo(chatId: string, name: string) {
  const p = draftPath(chatId, name);
  const [st, text] = await Promise.all([fs.stat(p), fs.readFile(p, "utf8")]);
  return { name, size: st.size, lines: text.split("\n").length, version: Math.floor(st.mtimeMs) };
}

export async function listDrafts(chatId: string) {
  const dir = chatDir(chatId);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const out = [];
  for (const n of names.filter((x) => x.endsWith(".html"))) {
    const st = await fs.stat(path.join(dir, n)).catch(() => null);
    if (st?.isFile()) out.push({ name: n, size: st.size, version: Math.floor(st.mtimeMs) });
  }
  return out.sort((a, b) => b.version - a.version);
}

export async function removeChatDir(chatId: string) {
  await fs.rm(chatDir(chatId), { recursive: true, force: true });
}

// 带行号显示一段（给 AI 看）
export function numbered(text: string, start = 1, end?: number) {
  const lines = text.split("\n");
  const s = Math.max(1, start);
  const e = Math.min(lines.length, end ?? s + 299);
  return {
    total: lines.length,
    text: lines
      .slice(s - 1, e)
      .map((l, i) => `${s + i}\t${l.length > 400 ? l.slice(0, 400) + " …（本行过长已截断）" : l}`)
      .join("\n"),
  };
}

// 静态检查：结构、平台约定、外部资源、脚本语法
export function staticCheck(html: string) {
  const problems: string[] = [];
  const tips: string[] = [];
  if (!/<!doctype html>/i.test(html)) tips.push("缺少 <!DOCTYPE html>");
  if (!/<meta[^>]+name=["']viewport/i.test(html)) tips.push("缺少 viewport meta，手机上会缩得很小");
  if (!/<meta[^>]+charset/i.test(html)) tips.push("缺少 <meta charset=\"utf-8\">，中文可能乱码");
  if (!/tp:score/.test(html)) tips.push("没有上报成绩（tp:score）；如果有小题，要用 parent.postMessage({ type: 'tp:score', score, max: 100 }, '*')");
  if (!/tp:complete/.test(html)) tips.push("没有发送 tp:complete（全部完成时发送）");
  if (/\blocalStorage\b|\bsessionStorage\b|document\.cookie|indexedDB/.test(html))
    problems.push("用到了 localStorage/sessionStorage/cookie/indexedDB：平台的沙箱里访问会直接报错，请删掉或用 try/catch 包住");
  const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\/([^"'/]+)[^"']*["']|from\s*["'](https?:)?\/\/([^"'/]+)/gi)]
    .map((m) => m[2] || m[4])
    .filter(Boolean);
  if (ext.length)
    problems.push(`引用了外部网站资源（${[...new Set(ext)].slice(0, 5).join("、")}）：学生在校园网/国内网络可能打不开，必须全部内嵌；3D 用平台内置的 /lib/three/`);

  // 逐个内联脚本做语法检查（行号按整个 HTML 文件计算）
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const code = m[2];
    if (/\bsrc\s*=/.test(attrs) || !code.trim()) continue;
    if (/type\s*=\s*["'](importmap|application\/json|text\/template|x-shader|text\/plain)/i.test(attrs)) {
      if (/importmap/i.test(attrs)) {
        try {
          JSON.parse(code);
        } catch (e) {
          problems.push(`importmap 不是合法 JSON：${(e as Error).message}`);
        }
      }
      continue;
    }
    const startLine = html.slice(0, m.index + m[0].indexOf(">") + 1).split("\n").length;
    const isModule = /type\s*=\s*["']module["']/i.test(attrs);
    // 模块脚本：去掉 import/export 后放进 async 函数里检查（保持行号不变）
    let src = code;
    if (isModule) {
      src = src
        .replace(/^\s*import\s+[^'"]*?from\s*['"][^'"]+['"]\s*;?/gm, (s) => s.replace(/[^\n]/g, " "))
        .replace(/^\s*import\s*['"][^'"]+['"]\s*;?/gm, (s) => s.replace(/[^\n]/g, " "))
        .replace(/^(\s*)export\s+(default\s+)?/gm, "$1");
      src = "(async()=>{" + src + "\n})";
    }
    try {
      new vm.Script(src, { filename: "html", lineOffset: startLine - 1 });
    } catch (e) {
      const err = e as Error & { stack?: string };
      const line = /html:(\d+)/.exec(err.stack ?? "")?.[1];
      problems.push(`脚本语法错误${line ? `（第 ${line} 行附近）` : ""}：${err.message}`);
    }
  }
  return { problems, tips };
}
