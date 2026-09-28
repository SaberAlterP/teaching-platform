"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { newCourse, switchCourse } from "./actions";

// 顶部导航里的课程切换：选中哪门课，课时、学生、批改、统计就显示哪门课
export function CourseSwitcher({ current, courses }: { current: string; courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      className="select w-24 shrink-0 truncate px-2 py-1.5 font-medium sm:w-48 sm:px-3"
      value={current}
      disabled={pending}
      title="切换课程"
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__new") {
          const title = prompt("新课程名称");
          if (title?.trim()) start(() => newCourse(title));
          return;
        }
        start(async () => {
          await switchCourse(v);
          router.refresh();
        });
      }}
    >
      {courses.map((c) => (
        <option key={c.id} value={c.id}>{c.title}</option>
      ))}
      <option value="__new">＋ 新建课程…</option>
    </select>
  );
}
