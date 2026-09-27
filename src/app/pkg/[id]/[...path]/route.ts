import fs from "fs";
import { Readable } from "stream";
import { assetDir, guessMime, safeJoin } from "@/lib/storage";

// HTML 包静态文件。
// 这些页面运行在 sandbox（无 allow-same-origin）的 iframe 里，属于"不透明来源"，
// 读不到平台的 Cookie，也调不了平台接口，所以一个游戏里的代码无法冒充学生或老师。
// 也因为不透明来源不会带 Cookie，这里不做登录校验；包 ID 是随机的，无法猜到。
export async function GET(_: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: parts } = await params;
  let file: string;
  try {
    file = safeJoin(assetDir(id), parts.map(decodeURIComponent).join("/"));
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat || !stat.isFile()) return new Response("Not found", { status: 404 });

  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": guessMime(file),
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*", // 不透明来源加载 ES module / fetch 需要
      // 即使有人直接打开这个地址，页面也被强制隔离
      "Content-Security-Policy": "sandbox allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
