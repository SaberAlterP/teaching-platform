import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { extractText, MAX_ATTACH, saveAttachment } from "@/lib/ai/extract";

// 对话附件：请求体是文件本身，文件名在 ?name= 里。提取文字后暂存，返回 id。
export async function POST(req: Request) {
  if (!(await getApiUser("TEACHER"))) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const name = (new URL(req.url).searchParams.get("name") ?? "").trim().slice(0, 120) || "附件";
  if (Number(req.headers.get("content-length") ?? 0) > MAX_ATTACH) return NextResponse.json({ error: "附件超过 20MB" }, { status: 413 });
  try {
    const buf = await readLimited(req, MAX_ATTACH);
    if (!buf) return NextResponse.json({ error: "附件超过 20MB" }, { status: 413 });
    const { text, truncated } = await extractText(buf, name);
    const id = await saveAttachment(name, text);
    return NextResponse.json({ id, name, chars: text.length, truncated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// 边收边计数，超过上限立即停止（请求不带 Content-Length 时，arrayBuffer() 会不限大小地全部读进内存）
async function readLimited(req: Request, limit: number) {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
