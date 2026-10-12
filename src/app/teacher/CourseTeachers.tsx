"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteTeacher, removeTeacher } from "./actions";

type Teacher = { id: string; name: string; username: string; email: string | null; owner: boolean };

// 课程页上的「授课老师」：创建者可以邀请其他老师一起建设课程、移除协作老师；协作老师可以退出
export function CourseTeachers({ courseId, me, teachers }: { courseId: string; me: string; teachers: Teacher[] }) {
  const isOwner = teachers.some((t) => t.owner && t.id === me);
  const [account, setAccount] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const invite = () =>
    start(async () => {
      const r = await inviteTeacher(courseId, account);
      if (r.error) setMsg({ error: r.error });
      else {
        setMsg({ ok: `已邀请 ${account}，对方刷新页面后就能在「我的课程」里看到这门课` });
        setAccount("");
      }
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
            <span className="text-xs text-slate-400">{t.owner ? "创建者" : t.username}</span>
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
          <button className="btn-outline" disabled={pending || !account.trim()}>
            邀请老师共建
          </button>
          <span className="text-xs text-slate-400">被邀请的老师可以编辑课时、管理学生、批改和发公告；只有你能邀请、移除老师和删除课程。</span>
        </form>
      ) : (
        <p className="text-xs text-slate-400">你是这门课的协作老师，可以编辑课时、管理学生、批改和发公告。点自己名字旁的 × 可以退出这门课。</p>
      )}
      {msg.error && <p className="text-sm text-rose-600">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-emerald-600">{msg.ok}</p>}
    </div>
  );
}
