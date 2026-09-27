"use client";
import { useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import type { RichTextData } from "@/lib/modules";
import { uploadFile } from "@/lib/upload-client";

export function RichTextEditor({ data, onChange }: { data: RichTextData; onChange: (d: RichTextData) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const img = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function insert(before: string, after = "", placeholder = "") {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange({ markdown: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }

  async function onImage(f: File) {
    setBusy(true);
    try {
      const r = await uploadFile(f, "file");
      insert(`![${f.name}](${r.url})`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tools: [string, () => void][] = [
    ["标题", () => insert("\n## ", "", "小标题")],
    ["加粗", () => insert("**", "**", "重点")],
    ["列表", () => insert("\n- ", "", "要点")],
    ["引用", () => insert("\n> ", "", "提示")],
    ["表格", () => insert("\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n")],
    ["链接", () => insert("[", "](https://)", "链接文字")],
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {tools.map(([label, fn]) => (
          <button key={label} type="button" className="btn-outline px-2.5 py-1 text-xs" onClick={fn}>{label}</button>
        ))}
        <input ref={img} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
        <button type="button" className="btn-outline px-2.5 py-1 text-xs" disabled={busy} onClick={() => img.current?.click()}>
          {busy ? "上传中…" : "插入图片"}
        </button>
        <span className="ml-auto self-center text-xs text-slate-400">左边编辑，右边实时预览</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <textarea
          ref={ta}
          className="input min-h-80 font-mono text-[13px] leading-relaxed"
          value={data.markdown}
          onChange={(e) => onChange({ markdown: e.target.value })}
        />
        <div className="max-h-[32rem] min-h-80 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
          <Markdown>{data.markdown}</Markdown>
        </div>
      </div>
    </div>
  );
}
