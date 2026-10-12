import { describe, expect, it } from "vitest";
import { canRemoveTeacher, courseRole, inviteError } from "@/lib/course-teachers";

const course = { teacherId: "owner" };
const teacher = (id: string, extra: Partial<{ role: string; approved: boolean }> = {}) => ({ id, role: "TEACHER", approved: true, ...extra });

describe("courseRole", () => {
  it("区分创建者、协作教师和无关的人", () => {
    expect(courseRole(course, "owner", ["a"])).toBe("owner");
    expect(courseRole(course, "a", ["a"])).toBe("teacher");
    expect(courseRole(course, "b", ["a"])).toBeNull();
  });
});

describe("inviteError", () => {
  it("正常的老师账号可以邀请", () => {
    expect(inviteError(teacher("a"), course, [])).toBe("");
  });
  it("账号不存在、是学生、未批准时不能邀请", () => {
    expect(inviteError(undefined, course, [])).toMatch("找不到");
    expect(inviteError(teacher("s", { role: "STUDENT" }), course, [])).toMatch("老师账号");
    expect(inviteError(teacher("a", { approved: false }), course, [])).toMatch("批准");
  });
  it("创建者本人、已在课程里的老师不能重复邀请", () => {
    expect(inviteError(teacher("owner"), course, [])).toMatch("创建者");
    expect(inviteError(teacher("a"), course, ["a"])).toMatch("已经");
  });
});

describe("canRemoveTeacher", () => {
  it("创建者可以移除协作教师，协作教师可以自己退出", () => {
    expect(canRemoveTeacher(course, "owner", "a")).toBe(true);
    expect(canRemoveTeacher(course, "a", "a")).toBe(true);
  });
  it("协作教师不能移除别人，创建者不能被移除", () => {
    expect(canRemoveTeacher(course, "a", "b")).toBe(false);
    expect(canRemoveTeacher(course, "a", "owner")).toBe(false);
    expect(canRemoveTeacher(course, "owner", "owner")).toBe(false);
  });
});
