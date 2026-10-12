"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteTeacher, removeTeacher, setTeacherCanEdit } from "./actions";

type Teacher = { id: string; name: string; username: string; email: string | null; owner: boolean; canEdit: boolean };

const ROLE_HINT = {
  edit: "共建：可以编辑课时、管理学生、批改和发公告",
  view: "仅浏览：只能查看课时、学生、成绩和公告，不能修改",
};

// 课程页上的「授课老师」：创建者可以邀请老师（共建 / 仅浏览）、切换权限、移除老师；协作老师可以退出
export function CourseTeachers({ courseId, me, teachers }: { courseId: string; me: string; teachers: Teacher[] }) {
  const isOwner = teachers.some((t) => t.owner && t.id === me);
  const mine = teachers.find((t) => t.id === me);
  const [account, setAccount] = useState("");
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const invite = () =>
    start(async () => {
      const r = await inviteTeacher(courseId, account, mode === "edit");
      if (r.error) setMsg({ error: r.error });
      else {
        setMsg({ ok: `已邀请 ${account}（${mode === "edit" ? "共建" : "仅浏览"}），对方刷新页面后就能在「我的课程」里看到这门课` });
        setAccount("");
      }
    });

  const toggle = (t: Teacher) =>
    start(async () => {
      const r = await setTeacherCanEdit(courseId, t.id, !t.canEdit);
      setMsg(r.error ? { error: r.error } : {});
    });

  const remove = (t: Teacher) => {
    const self = t.id === me;
    if (!confirm(self ? "退出这门课？退出后就看不到这门课了，课程内容不受影响。" : `把 ${t.name} 移出这门课？课程内容不受影响。`)) return;
    start(async () => {
      const r = await removeTeacher(courseId, t.id);
      if (r.error) setMsg({ error: r.error });
      else if (self) router.push("/teacher");
      else setMsg({});
    });
  };

  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-semibold">授课老师</h2>
        {teachers.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-sm text-slate-700">
            {t.name}
            {t.owner ? (
              <span className="text-xs text-slate-400">创建者</span>
            ) : isOwner ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(t)}
                className={`rounded px-1.5 text-xs hover:underline ${t.canEdit ? "text-brand-600" : "text-amber-600"}`}
                title={t.canEdit ? "点击改为仅浏览" : "点击改为共建（可编辑）"}
              >
                {t.canEdit ? "共建" : "仅浏览"}
              </button>
            ) : (
              <span className={`text-xs ${t.canEdit ? "text-brand-600" : "text-amber-600"}`}>{t.canEdit ? "共建" : "仅浏览"}</span>
            )}
            {!t.owner && (isOwner || t.id === me) ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(t)}
                className="rounded-full px-1.5 text-slate-400 hover:bg-slate-200 hover:text-rose-600"
                title={t.id === me ? "退出这门课" : "移出这门课"}
              >
                ×
              </button>
            ) : (
              <span className="w-1" />
            )}
          </span>
        ))}
      </div>
      {isOwner ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="对方的用户名或邮箱"
            className="input max-w-xs"
          />
          <select value={mode} onChange={(e) => setMode(e.target.value as "edit" | "view")} className="input w-auto" aria-label="邀请方式">
            <option value="edit">共建（可编辑）</option>
            <option value="view">仅浏览</option>
          </select>
          <button className="btn-outline" disabled={pending || !account.trim()}>
            邀请
          </button>
          <span className="text-xs text-slate-400">{ROLE_HINT[mode]}。点老师名字旁的「共建 / 仅浏览」可以切换。</span>
        </form>
      ) : (
        <p className="text-xs text-slate-400">
          你是这门课的{mine?.canEdit ? "共建老师，可以编辑课时、管理学生、批改和发公告" : "仅浏览老师，只能查看，不能修改"}。点自己名字旁的 × 可以退出这门课。
        </p>
      )}
      {msg.error && <p className="text-sm text-rose-600">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-emerald-600">{msg.ok}</p>}
    </div>
  );
}
