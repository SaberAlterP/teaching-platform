import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";
import { TopNav } from "@/components/TopNav";
import { ThemePicker } from "@/components/ThemePicker";
import { CourseSwitcher } from "./CourseSwitcher";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const t = await requireTeacher();
  const { course, courses } = await getTeacherCourse(t.id);
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(schema.submissions)
    .innerJoin(schema.modules, eq(schema.modules.id, schema.submissions.moduleId))
    .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
    .where(and(eq(schema.lessons.courseId, course.id), eq(schema.submissions.needsGrading, true)));
  // 管理员的「管理」菜单上显示待批准的新老师数
  const waiting = t.isAdmin
    ? (await db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.role, "TEACHER"), eq(schema.users.approved, false))))[0].n
    : 0;
  return (
    <>
      <TopNav
        name={t.name}
        role="TEACHER"
        admin={t.isAdmin}
        tools={<ThemePicker current={t.theme} />}
        switcher={<CourseSwitcher current={course.id} courses={courses.map((c) => ({ id: c.id, title: c.title }))} />}
        links={[
          { href: "/teacher", label: "我的课程" },
          { href: "/teacher/students", label: "学生" },
          { href: "/teacher/grading", label: "批改", badge: pending },
          { href: "/teacher/stats", label: "成绩统计" },
          { href: "/teacher/announcements", label: "公告" },
          { href: "/teacher/assistant", label: "AI 助手" },
          { href: "/teacher/ai", label: "AI 接口" },
          ...(t.isAdmin ? [{ href: "/admin", label: "管理", badge: waiting }] : []),
        ]}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 has-[.lesson-full]:max-w-none">{children}</main>
    </>
  );
}
