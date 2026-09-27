// 浏览器端上传（带进度）
export type UploadResult = { id: string; filename: string; mime: string; url: string };

export function uploadFile(file: File, kind: "file" | "package", onProgress?: (p: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(body.error || "上传失败"));
        else resolve(body);
      } catch {
        reject(new Error("上传失败"));
      }
    };
    xhr.onerror = () => reject(new Error("网络错误，上传失败"));
    xhr.send(fd);
  });
}
