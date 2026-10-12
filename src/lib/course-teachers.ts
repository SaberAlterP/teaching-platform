// 课程协作教师的权限判断（纯逻辑，不碰数据库，tests/course-teachers.test.ts 里有测试）。
// 规则：
// - 创建者（courses.teacher_id）和协作教师（course_teachers）都能编辑课时、管理学生、批改、发公告；
// - 只有创建者能邀请、移除协作教师，能删除课程；
// - 协作教师可以自己退出课程。

export type CourseRole = "owner" | "teacher" | null;

export function courseRole(course: { teacherId: string }, userId: string, memberIds: string[]): CourseRole {
  if (course.teacherId === userId) return "owner";
  return memberIds.includes(userId) ? "teacher" : null;
}

// 被邀请的账号是否合适；返回错误提示，空字符串表示可以邀请
export function inviteError(
  target: { id: string; role: string; approved: boolean } | null | undefined,
  course: { teacherId: string },
  memberIds: string[],
): string {
  if (!target) return "找不到这个老师账号，请确认用户名或邮箱";
  if (target.role !== "TEACHER") return "只能邀请老师账号";
  if (!target.approved) return "这个老师账号还没通过管理员批准";
  if (target.id === course.teacherId) return "他是这门课的创建者";
  if (memberIds.includes(target.id)) return "他已经在这门课里了";
  return "";
}

// 移除协作教师：创建者可以移除任何协作教师，协作教师只能移除自己（退出课程）
export function canRemoveTeacher(course: { teacherId: string }, actorId: string, targetId: string) {
  if (targetId === course.teacherId) return false; // 创建者不能被移除
  return actorId === course.teacherId || actorId === targetId;
}
