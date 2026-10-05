import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { reportPreview } from "@/lib/ai/agent";
import { ownChat } from "@/lib/ai/chats";

// 老师浏览器里的草稿预览跑完后，把运行错误和成绩上报情况交回来，供 AI 的 html_check 使用
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getApiUser("TEACHER");
  if (!u) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  try {
    await ownChat(u.id, id);
    const b = await req.json();
    const errors = Array.isArray(b.errors) ? b.errors.map(String) : [];
    const scores = Array.isArray(b.scores) ? b.scores.map(Number).filter(Number.isFinite) : [];
    reportPreview(id, String(b.file), Number(b.version) || 0, errors, scores);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
