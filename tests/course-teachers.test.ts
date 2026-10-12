import { describe, expect, it } from "vitest";
import { canEditCourse, canRemoveTeacher, courseRole, inviteError } from "@/lib/course-teachers";

const course = { teacherId: "owner" };
const teacher = (id: string, extra: Partial<{ role: string; approved: boolean }> = {}) => ({ id, role: "TEACHER", approved: true, ...extra });
const members = [{ userId: "a", canEdit: true }, { userId: "v", canEdit: false }];

describe("courseRole", () => {
  it("区分创建者、共建老师、仅浏览老师和无关的人", () => {
    expect(courseRole(course, "owner", members)).toBe("owner");
    expect(courseRole(course, "a", members)).toBe("editor");
    expect(courseRole(course, "v", members)).toBe("viewer");
    expect(courseRole(course, "b", members)).toBeNull();
  });
  it("只有创建者和共建老师能编辑", () => {
    expect(canEditCourse("owner")).toBe(true);
    expect(canEditCourse("editor")).toBe(true);
    expect(canEditCourse("viewer")).toBe(false);
    expect(canEditCourse(null)).toBe(false);
  });
});

describe("inviteError", () => {
  it("正常的老师账号可以邀请", () => {
    expect(inviteError(teacher("b"), course, members)).toBe("");
  });
  it("账号不存在、是学生、未批准时不能邀请", () => {
    expect(inviteError(undefined, course, [])).toMatch("找不到");
    expect(inviteError(teacher("s", { role: "STUDENT" }), course, [])).toMatch("老师账号");
    expect(inviteError(teacher("x", { approved: false }), course, [])).toMatch("批准");
  });
  it("创建者本人、已在课程里的老师（不论哪种权限）不能重复邀请", () => {
    expect(inviteError(teacher("owner"), course, [])).toMatch("创建者");
    expect(inviteError(teacher("a"), course, members)).toMatch("已经");
    expect(inviteError(teacher("v"), course, members)).toMatch("已经");
  });
});

describe("canRemoveTeacher", () => {
  it("创建者可以移除协作教师，协作教师可以自己退出", () => {
    expect(canRemoveTeacher(course, "owner", "a")).toBe(true);
    expect(canRemoveTeacher(course, "v", "v")).toBe(true);
  });
  it("协作教师不能移除别人，创建者不能被移除", () => {
    expect(canRemoveTeacher(course, "a", "v")).toBe(false);
    expect(canRemoveTeacher(course, "a", "owner")).toBe(false);
    expect(canRemoveTeacher(course, "owner", "owner")).toBe(false);
  });
});
