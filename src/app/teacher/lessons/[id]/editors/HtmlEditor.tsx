"use client";
import { useRef, useState } from "react";
import type { HtmlData } from "@/lib/modules";
import { uploadFile } from "@/lib/upload-client";
import { HtmlFrame, type FrameMessage } from "@/components/modules/HtmlFrame";
import type { PackageMap } from "../ModuleCard";

export function HtmlEditor({
  data, packages, onChange, onPackage,
}: {
  data: HtmlData;
  packages: PackageMap;
  onChange: (d: HtmlData) => void;
  onPackage: (id: string, info: { filename: string; url: string }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [lastMsg, setLastMsg] = useState<FrameMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const pkg = data.assetId ? packages[data.assetId] : undefined;

  async function onFile(f: File) {
    setProgress(0);
    try {
      const r = await uploadFile(f, "package", setProgress);
      onPackage(r.id, { filename: r.filename, url: r.url });
      onChange({ ...data, assetId: r.id });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept=".html,.htm,.zip" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button type="button" className="btn-primary" disabled={progress !== null} onClick={() => input.current?.click()}>
          {progress !== null ? `上传中 ${Math.round(progress * 100)}%` : pkg ? "替换 HTML 包" : "上传 HTML 包"}
        </button>
        {pkg && <span className="text-sm text-slate-600">当前：{pkg.filename}</span>}
        <span className="text-xs text-slate-400">单个 .html 文件，或包含 index.html 的 .zip（可带 js、图片、模型等资源）</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">显示高度（像素）</label>
          <input type="number" className="input" min={200} max={2000} value={data.height}
            onChange={(e) => onChange({ ...data, height: Number(e.target.value) || 560 })} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={data.scored} onChange={(e) => onChange({ ...data, scored: e.target.checked })} />
            计入成绩（接收游戏上报的分数）
          </label>
        </div>
        {data.scored && (
          <div>
            <label className="label">满分</label>
            <input type="number" className="input" min={1} value={data.maxScore ?? 100}
              onChange={(e) => onChange({ ...data, maxScore: Number(e.target.value) || 100 })} />
          </div>
        )}
      </div>
      <div>
        <label className="label">给学生的说明（可选）</label>
        <input className="input" value={data.note ?? ""} placeholder="例如：完成三轮调度后成绩会自动记录" onChange={(e) => onChange({ ...data, note: e.target.value })} />
      </div>

      {pkg ? (
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            预览
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setReloadKey((k) => k + 1)}>重新加载</button>
            {lastMsg && (
              <span className="text-emerald-600">
                收到包内消息：{lastMsg.type === "tp:score" ? `成绩 ${lastMsg.score}${lastMsg.max ? " / " + lastMsg.max : ""}` : "完成"}
              </span>
            )}
          </div>
          <HtmlFrame key={reloadKey} src={pkg.url} height={Math.min(data.height, 700)} onMessage={setLastMsg} />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          还没有上传内容。你在其他地方（包括和 Claude 的对话）做好的游戏、动画网页，保存成 .html 直接上传即可。
        </div>
      )}
    </div>
  );
}
