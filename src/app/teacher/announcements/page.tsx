import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";
import { EmptyState } from "@/components/EmptyState";
import { deleteAnnouncement, postAnnouncement, togglePin } from "./actions";

export const metadata = { title: "公告" };

export default async function AnnouncementsPage() {
  const t = await requireTeacher();
  const { course } = await getTeacherCourse(t.id);
  const list = await db
    .select()
    .from(schema.announcements)
    .where(eq(schema.announcements.courseId, course.id))
    .orderBy(desc(schema.announcements.pinned), desc(schema.announcements.createdAt));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">公告</h1>
        <p className="mt-1 text-sm text-slate-500">发给「{course.title}」的学生，学生在首页就能看到。</p>
      </div>

      <form action={postAnnouncement} className="card space-y-3 p-4">
        <input name="title" required maxLength={100} placeholder="标题，例如：本周五课堂测验" className="input w-full" />
        <textarea name="body" rows={3} maxLength={2000} placeholder="内容（可不填）" className="input w-full" />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="pinned" /> 置顶
          </label>
          <button className="btn-primary">发布</button>
        </div>
      </form>

      {list.length === 0 ? (
        <EmptyState title="还没有公告" hint="发布后，这门课的学生会在首页看到" />
      ) : (
        <ul className="space-y-3">
          {list.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">
                    {a.pinned && <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">置顶</span>}
                    {a.title}
                  </div>
                  {a.body && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{a.body}</p>}
                  <div className="mt-2 text-xs text-slate-400">{a.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</div>
                </div>
                <form action={togglePin.bind(null, a.id)}><button className="btn-outline text-xs">{a.pinned ? "取消置顶" : "置顶"}</button></form>
                <form action={deleteAnnouncement.bind(null, a.id)}><button className="btn-outline text-xs text-red-600">删除</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
