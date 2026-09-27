"use client";
import { useState, useTransition } from "react";
import {
  MODULE_LABELS, type HtmlData, type MediaData, type ModuleType, type QuizData, type RichTextData,
} from "@/lib/modules";
import { updateModule } from "../../actions";
import { RichTextEditor } from "./editors/RichTextEditor";
import { MediaEditor } from "./editors/MediaEditor";
import { QuizEditor } from "./editors/QuizEditor";
import { HtmlEditor } from "./editors/HtmlEditor";

export type EditorModule = { id: string; type: ModuleType; title: string; data: Record<string, unknown> };
export type PackageMap = Record<string, { filename: string; url: string }>;

export function ModuleCard(p: {
  index: number;
  module: EditorModule;
  icon: string;
  open: boolean;
  packages: PackageMap;
  onToggle: () => void;
  onSaved: (patch: Partial<EditorModule>) => void;
  onPackage: (id: string, info: { filename: string; url: string }) => void;
  onUp: () => void;
  onDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const m = p.module;
  const [title, setTitle] = useState(m.title);
  const [data, setData] = useState(m.data);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = title !== m.title || JSON.stringify(data) !== JSON.stringify(m.data);

  function save() {
    start(async () => {
      setErr("");
      const r = await updateModule(m.id, { title, data });
      if (r?.error) return setErr(r.error);
      p.onSaved({ title, data });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className={`card overflow-hidden ${p.open ? "ring-2 ring-brand-100" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="cursor-grab select-none text-slate-300" title="拖动排序">⋮⋮</span>
        <span className="text-lg">{p.icon}</span>
        <button onClick={p.onToggle} className="min-w-0 flex-1 text-left">
          <div className="truncate font-medium">
            {m.title || <span className="text-slate-400">未命名{MODULE_LABELS[m.type]}</span>}
            {dirty && <span className="ml-2 text-xs text-amber-600">● 未保存</span>}
          </div>
          <div className="truncate text-xs text-slate-400">
            {MODULE_LABELS[m.type]} · {summarize(m, p.packages)}
          </div>
        </button>
        <div className="flex shrink-0 items-center text-sm">
          <button className="btn-ghost px-2" onClick={p.onUp} title="上移">↑</button>
          <button className="btn-ghost px-2" onClick={p.onDown} title="下移">↓</button>
          <button className="btn-ghost px-2" onClick={p.onDuplicate}>复制</button>
          <button className="btn-danger px-2" onClick={p.onDelete}>删除</button>
          <button className="btn-outline ml-1" onClick={p.onToggle}>{p.open ? "收起" : "编辑"}</button>
        </div>
      </div>

      {p.open && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4">
          <div>
            <label className="label">模块标题（学生可见，可留空）</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {m.type === "RICHTEXT" && (
            <RichTextEditor data={data as unknown as RichTextData} onChange={(d) => setData(d as unknown as Record<string, unknown>)} />
          )}
          {m.type === "MEDIA" && (
            <MediaEditor data={data as unknown as MediaData} onChange={(d) => setData(d as unknown as Record<string, unknown>)} />
          )}
          {m.type === "QUIZ" && (
            <QuizEditor data={data as unknown as QuizData} onChange={(d) => setData(d as unknown as Record<string, unknown>)} />
          )}
          {m.type === "HTML" && (
            <HtmlEditor
              data={data as unknown as HtmlData}
              packages={p.packages}
              onPackage={p.onPackage}
              onChange={(d) => setData(d as unknown as Record<string, unknown>)}
            />
          )}
          <div className="sticky bottom-0 flex items-center gap-3 border-t border-slate-100 bg-white/90 pt-3 backdrop-blur">
            <button className="btn-primary" disabled={!dirty || pending} onClick={save}>
              {pending ? "保存中…" : "保存模块"}
            </button>
            {dirty && (
              <button className="btn-ghost" onClick={() => { setTitle(m.title); setData(m.data); setErr(""); }}>
                放弃修改
              </button>
            )}
            {saved && <span className="text-sm text-emerald-600">已保存</span>}
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function summarize(m: EditorModule, pkgs: PackageMap) {
  const d = m.data;
  switch (m.type) {
    case "RICHTEXT":
      return String((d as unknown as RichTextData).markdown ?? "").replace(/[#*>`\-\n|]/g, " ").slice(0, 60) || "空";
    case "MEDIA": {
      const x = d as unknown as MediaData;
      return x.src ? `${x.kind === "video" ? "视频" : "图片"}${x.caption ? " · " + x.caption : ""}` : "未上传";
    }
    case "QUIZ": {
      const q = d as unknown as QuizData;
      const pts = q.questions.reduce((a, b) => a + b.points, 0);
      return `${q.questions.length} 题，共 ${pts} 分`;
    }
    case "HTML": {
      const x = d as unknown as HtmlData;
      return x.assetId ? `${pkgs[x.assetId]?.filename ?? "已上传"}${x.scored ? " · 计分" : ""}` : "未上传";
    }
  }
}
