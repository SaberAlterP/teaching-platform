import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { MAX_FILE, MAX_PACKAGE, saveFile, savePackage } from "@/lib/storage";

// 老师上传文件：kind=file（图片/视频）或 kind=package（HTML 包）
// 请求体就是文件本身（不是表单），边收边写硬盘，大视频也不会占满内存。
// 文件名放在 ?name= 里，类型放在 Content-Type 里。
export async function POST(req: Request) {
  if (!(await getApiUser("TEACHER"))) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "package" ? "package" : "file";
  const filename = (url.searchParams.get("name") ?? "").trim().slice(0, 200) || "未命名";
  const limit = kind === "package" ? MAX_PACKAGE : MAX_FILE;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > limit)
    return NextResponse.json({ error: `文件超过 ${Math.round(limit / 1024 / 1024)}MB` }, { status: 413 });
  if (!req.body) return NextResponse.json({ error: "没有文件" }, { status: 400 });
  try {
    const row =
      kind === "package"
        ? await savePackage(req.body, filename)
        : await saveFile(req.body, filename, req.headers.get("content-type") ?? "");
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
