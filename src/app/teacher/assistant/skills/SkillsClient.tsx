"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSkillAction, saveSkillAction } from "../actions";

type Skill = { slug: string; name: string; description: string; content: string; enabled: boolean; builtin: boolean; modified: boolean };

export function SkillsClient({ skills }: { skills: Skill[] }) {
  const [editing, setEditing] = useState<string | null>(null); // slug，"" 表示新建
  return (
    <div className="space-y-3">
      {skills.map((s) =>
        editing === s.slug ? (
          <SkillForm key={s.slug} skill={s} onDone={() => setEditing(null)} />
        ) : (
          <div key={s.slug} className={`card flex items-start gap-3 p-4 ${s.enabled ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.name}</span>
                {s.builtin ? <span className="badge bg-slate-100 text-slate-500">内置</span> : <span className="badge bg-brand-50 text-brand-600">自建</span>}
                {s.modified && <span className="badge bg-amber-50 text-amber-700">已修改</span>}
                {!s.enabled && <span className="badge bg-slate-200 text-slate-500">已停用</span>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{s.description}</p>
              <p className="mt-1 text-xs text-slate-400">全文 {s.content.length} 字</p>
            </div>
            <button className="btn-outline shrink-0" onClick={() => setEditing(s.slug)}>查看 / 修改</button>
          </div>
        ),
      )}
      {editing === "" ? (
        <SkillForm skill={null} onDone={() => setEditing(null)} />
      ) : (
        <button className="btn-outline" onClick={() => setEditing("")}>＋ 新建技能</button>
      )}
    </div>
  );
}

function SkillForm({ skill, onDone }: { skill: Skill | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [content, setContent] = useState(skill?.content ?? "");
  const [enabled, setEnabled] = useState(skill?.enabled ?? true);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveSkillAction(skill?.slug ?? null, { name, description, content, enabled });
      if (r.error) return setErr(r.error);
      router.refresh();
      onDone();
    });
  const remove = () => {
    const msg = skill?.builtin ? "恢复成内置的默认内容？你的修改会丢失。" : `删除技能「${skill?.name}」？`;
    if (!confirm(msg)) return;
    start(async () => {
      await deleteSkillAction(skill!.slug);
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="card space-y-3 border-brand-500 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label>
          <span className="label">名称</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：本校课件格式" />
        </label>
        <label>
          <span className="label">什么时候用（一句话，AI 靠它判断要不要读取）</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例如：写任何课时正文时使用" />
        </label>
      </div>
      <label className="block">
        <span className="label">内容（写给 AI 的规范，可以用 Markdown）</span>
        <textarea className="input h-[55vh] font-mono text-xs leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 启用（停用后 AI 不会看到这个技能）
      </label>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending} onClick={save}>保存</button>
        <button className="btn-ghost" onClick={onDone}>取消</button>
        {skill && (skill.modified || !skill.builtin) && (
          <button className="btn-danger ml-auto" disabled={pending} onClick={remove}>{skill.builtin ? "恢复默认" : "删除"}</button>
        )}
      </div>
    </div>
  );
}
