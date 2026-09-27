// 浏览器端上传（带进度）
export type UploadResult = { id: string; filename: string; mime: string; url: string };

export function uploadFile(file: File, kind: "file" | "package", onProgress?: (p: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const limitMb = kind === "package" ? 100 : 200;
    if (file.size > limitMb * 1024 * 1024) return reject(new Error(`文件超过 ${limitMb}MB`));
    const xhr = new XMLHttpRequest();
    // 直接发送文件本身，服务器边收边存
    xhr.open("POST", `/api/upload?kind=${kind}&name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
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
    xhr.send(file);
  });
}
