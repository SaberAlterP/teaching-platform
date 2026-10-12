// 课程协作教师的权限判断（纯逻辑，不碰数据库，tests/course-teachers.test.ts 里有测试）。
// 规则：
// - 创建者（courses.teacher_id）和共建老师（course_teachers.can_edit = true）能编辑课时、管理学生、批改、发公告；
// - 仅浏览的老师（can_edit = false）只能查看，不能修改任何内容；
// - 只有创建者能邀请、移除老师，修改老师权限，删除课程；
// - 协作老师（两种都算）可以自己退出课程。

export type CourseRole = "owner" | "editor" | "viewer" | null;
export type Member = { userId: string; canEdit: boolean };

export function courseRole(course: { teacherId: string }, userId: string, members: Member[]): CourseRole {
  if (course.teacherId === userId) return "owner";
  const m = members.find((x) => x.userId === userId);
  if (!m) return null;
  return m.canEdit ? "editor" : "viewer";
}

export const canEditCourse = (role: CourseRole) => role === "owner" || role === "editor";

// 被邀请的账号是否合适；返回错误提示，空字符串表示可以邀请
export function inviteError(
  target: { id: string; role: string; approved: boolean } | null | undefined,
  course: { teacherId: string },
  members: Member[],
): string {
  if (!target) return "找不到这个老师账号，请确认用户名或邮箱";
  if (target.role !== "TEACHER") return "只能邀请老师账号";
  if (!target.approved) return "这个老师账号还没通过管理员批准";
  if (target.id === course.teacherId) return "他是这门课的创建者";
  if (members.some((m) => m.userId === target.id)) return "他已经在这门课里了，可以在名字上切换权限";
  return "";
}

// 移除协作教师：创建者可以移除任何协作教师，协作教师只能移除自己（退出课程）
export function canRemoveTeacher(course: { teacherId: string }, actorId: string, targetId: string) {
  if (targetId === course.teacherId) return false; // 创建者不能被移除
  return actorId === course.teacherId || actorId === targetId;
}
