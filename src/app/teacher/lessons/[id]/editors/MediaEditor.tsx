"use client";
import { useRef, useState } from "react";
import type { MediaData } from "@/lib/modules";
import { uploadFile } from "@/lib/upload-client";
import { MediaView } from "@/components/modules/MediaView";

export function MediaEditor({ data, onChange }: { data: MediaData; onChange: (d: MediaData) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function onFile(f: File) {
    setProgress(0);
    try {
      const r = await uploadFile(f, "file", setProgress);
      onChange({ ...data, src: r.url, kind: f.type.startsWith("video") ? "video" : "image" });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(["image", "video"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ ...data, kind: k })}
              className={`rounded-md px-3 py-1 ${data.kind === k ? "bg-brand-500 text-white" : "text-slate-600"}`}
            >
              {k === "image" ? "图片" : "视频"}
            </button>
          ))}
        </div>
        <input
          ref={input}
          type="file"
          accept={data.kind === "video" ? "video/*" : "image/*"}
          hidden
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <button type="button" className="btn-primary" disabled={progress !== null} onClick={() => input.current?.click()}>
          {progress !== null ? `上传中 ${Math.round(progress * 100)}%` : "上传文件"}
        </button>
        <span className="text-xs text-slate-400">大视频建议压缩到 720p，课堂上几百人同时加载会快很多</span>
      </div>
      <div>
        <label className="label">或填写链接</label>
        <input className="input" value={data.src} placeholder="https://..." onChange={(e) => onChange({ ...data, src: e.target.value })} />
      </div>
      <div>
        <label className="label">说明文字</label>
        <input className="input" value={data.caption ?? ""} onChange={(e) => onChange({ ...data, caption: e.target.value })} />
      </div>
      {data.src && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <MediaView data={data} />
        </div>
      )}
    </div>
  );
}
