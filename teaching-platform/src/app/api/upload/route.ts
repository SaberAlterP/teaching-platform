import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveFile, savePackage } from "@/lib/storage";

// 老师上传文件：kind=file（图片/视频）或 kind=package（HTML 包）
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "TEACHER") return NextResponse.json({ error: "无权限" }, { status: 403 });
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "没有文件" }, { status: 400 });
    const row = fd.get("kind") === "package" ? await savePackage(file) : await saveFile(file);
    return NextResponse.json({
      id: row.id,
      filename: row.filename,
      mime: row.mime,
      url: row.kind === "package" ? `/pkg/${row.id}/${row.entry}` : `/api/files/${row.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
