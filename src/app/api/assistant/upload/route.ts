import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractText, MAX_ATTACH, saveAttachment } from "@/lib/ai/extract";

// 对话附件：请求体是文件本身，文件名在 ?name= 里。提取文字后暂存，返回 id。
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "TEACHER") return NextResponse.json({ error: "无权限" }, { status: 403 });
  const name = (new URL(req.url).searchParams.get("name") ?? "").trim().slice(0, 120) || "附件";
  if (Number(req.headers.get("content-length") ?? 0) > MAX_ATTACH) return NextResponse.json({ error: "附件超过 20MB" }, { status: 413 });
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > MAX_ATTACH) return NextResponse.json({ error: "附件超过 20MB" }, { status: 413 });
    const { text, truncated } = await extractText(buf, name);
    const id = await saveAttachment(name, text);
    return NextResponse.json({ id, name, chars: text.length, truncated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
