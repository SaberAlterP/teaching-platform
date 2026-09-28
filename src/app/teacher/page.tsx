import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { getTeacherCourse } from "@/lib/course";
import { LessonList } from "./LessonList";
import { CourseHeader } from "./CourseHeader";

export default async function TeacherHome() {
  const t = await requireTeacher();
  const { course, cls, courses } = await getTeacherCourse(t.id);
  const lessons = await db
    .select({
      id: schema.lessons.id,
      title: schema.lessons.title,
      summary: schema.lessons.summary,
      section: schema.lessons.section,
      status: schema.lessons.status,
      openAt: schema.lessons.openAt,
      updatedAt: schema.lessons.updatedAt,
    })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, course.id))
    .orderBy(asc(schema.lessons.order), asc(schema.lessons.createdAt));
  const counts = await db
    .select({ lessonId: schema.modules.lessonId, n: count() })
    .from(schema.modules)
    .innerJoin(schema.lessons, eq(schema.lessons.id, schema.modules.lessonId))
    .where(eq(schema.lessons.courseId, course.id))
    .groupBy(schema.modules.lessonId);
  const countMap = new Map(counts.map((c) => [c.lessonId, c.n]));
  const [{ students }] = await db
    .select({ students: count() })
    .from(schema.enrollments)
    .where(eq(schema.enrollments.classId, cls.id));

  return (
    <div className="space-y-6">
      <CourseHeader
        key={course.id}
        id={course.id}
        title={course.title}
        description={course.description}
        className={cls.name}
        students={students}
        lessons={lessons.length}
        canDelete={courses.length > 1 && lessons.length === 0 && students === 0}
      />
      <LessonList
        otherCourses={courses.filter((c) => c.id !== course.id).map((c) => ({ id: c.id, title: c.title }))}
        lessons={lessons.map((l) => ({ ...l, moduleCount: countMap.get(l.id) ?? 0, openAt: l.openAt?.toISOString() ?? null, updatedAt: l.updatedAt.toISOString() }))}
      />
    </div>
  );
}
