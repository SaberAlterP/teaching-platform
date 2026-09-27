"use client";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { RichTextData } from "@/lib/modules";
import { uploadFile } from "@/lib/upload-client";

// 所见即所得的图文编辑器，内容仍以 Markdown 保存（学生端用同一套样式显示）。
// 图片可以点按钮插入，也可以直接粘贴截图或拖进来。
export function RichTextEditor({ data, onChange }: { data: RichTextData; onChange: (d: RichTextData) => void }) {
  const img = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const last = useRef(data.markdown);
  // 编辑器会把 Markdown 重新排版（如表格对齐）；内容没实际改动时仍返回原文，避免误显示"未保存"
  const base = useRef({ norm: "", orig: data.markdown });
  const cb = useRef(onChange);
  cb.current = onChange;

  async function uploadImages(ed: Editor, files: File[], pos?: number) {
    for (const f of files) {
      setUploading((n) => n + 1);
      try {
        const r = await uploadFile(f, "file");
        const node = { type: "image", attrs: { src: r.url, alt: f.name.replace(/\.[^.]+$/, "") } };
        if (pos === undefined) ed.chain().focus().insertContent(node).run();
        else ed.chain().focus().insertContentAt(pos, node).run();
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false, // Markdown 无下划线
        link: { openOnClick: false, autolink: true },
      }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: "在这里输入正文，可以直接粘贴截图或把图片拖进来…" }),
      Markdown,
    ],
    content: data.markdown,
    contentType: "markdown",
    editorProps: {
      attributes: { class: "prose-tp rte-content min-h-72 px-5 py-4 outline-none" },
      handlePaste(view, event) {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length || !editorRef.current) return false;
        event.preventDefault();
        uploadImages(editorRef.current, files);
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        const files = moved ? [] : imageFiles(event.dataTransfer?.files);
        if (!files.length || !editorRef.current) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        uploadImages(editorRef.current, files, pos);
        return true;
      },
    },
    onCreate({ editor }) {
      base.current.norm = editor.getMarkdown().trimEnd();
    },
    onUpdate({ editor }) {
      let md = editor.getMarkdown().trimEnd();
      if (md === base.current.norm) md = base.current.orig;
      last.current = md;
      cb.current({ markdown: md });
    },
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // 外部改动（如"放弃修改"）时同步到编辑器
  useEffect(() => {
    if (!editor || data.markdown === last.current) return;
    last.current = data.markdown;
    editor.commands.setContent(data.markdown, { contentType: "markdown", emitUpdate: false });
    base.current = { norm: editor.getMarkdown().trimEnd(), orig: data.markdown };
  }, [editor, data.markdown]);

  return (
    <div className="overflow-clip rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
      <input
        ref={img}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = imageFiles(e.target.files);
          e.target.value = "";
          if (editor && files.length) uploadImages(editor, files);
        }}
      />
      {editor && <Toolbar editor={editor} onImage={() => img.current?.click()} uploading={uploading > 0} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function imageFiles(list?: FileList | null) {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

function Toolbar({ editor, onImage, uploading }: { editor: Editor; onImage: () => void; uploading: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  function setLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("链接地址（留空则取消链接）", prev ?? "https://");
    if (url === null) return;
    if (!url.trim() || url === "https://") c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="sticky top-14 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <B title="撤销 (Ctrl+Z)" disabled={!s.undo} onClick={() => c().undo().run()}>↶</B>
        <B title="重做 (Ctrl+Y)" disabled={!s.redo} onClick={() => c().redo().run()}>↷</B>
        <Sep />
        <B active={!s.h2 && !s.h3} onClick={() => c().setParagraph().run()}>正文</B>
        <B active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>大标题</B>
        <B active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>小标题</B>
        <Sep />
        <B title="加粗 (Ctrl+B)" active={s.bold} onClick={() => c().toggleBold().run()}><b>B</b></B>
        <B title="斜体 (Ctrl+I)" active={s.italic} onClick={() => c().toggleItalic().run()}><i>I</i></B>
        <B title="删除线" active={s.strike} onClick={() => c().toggleStrike().run()}><s>S</s></B>
        <Sep />
        <B active={s.bullet} onClick={() => c().toggleBulletList().run()}>• 列表</B>
        <B active={s.ordered} onClick={() => c().toggleOrderedList().run()}>1. 编号</B>
        <B title="浅蓝色提示框" active={s.quote} onClick={() => c().toggleBlockquote().run()}>提示框</B>
        <B active={s.link} onClick={setLink}>链接</B>
        <B onClick={() => c().setHorizontalRule().run()}>分隔线</B>
        <Sep />
        <B disabled={uploading} onClick={onImage}>{uploading ? "图片上传中…" : "🖼 图片"}</B>
        <B active={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦ 表格</B>
      </div>
      {s.table && (
        <div className="flex flex-wrap items-center gap-0.5 border-t border-slate-200 px-2 py-1 text-xs">
          <span className="px-1 text-slate-400">表格：</span>
          <B onClick={() => c().addRowAfter().run()}>加一行</B>
          <B onClick={() => c().addColumnAfter().run()}>加一列</B>
          <B onClick={() => c().deleteRow().run()}>删这行</B>
          <B onClick={() => c().deleteColumn().run()}>删这列</B>
          <B danger onClick={() => c().deleteTable().run()}>删除表格</B>
        </div>
      )}
    </div>
  );
}

function B({
  children, onClick, active, disabled, title, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      // 防止点按钮时编辑器失去选区
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-8 rounded-md px-2 py-1 text-sm transition disabled:opacity-35 ${
        active ? "bg-brand-100 text-brand-700" : danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-200/70"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-slate-300" />;
}
