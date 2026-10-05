import { describe, expect, it } from "vitest";
import { isLessonStatus, isPlainObject, pickLessonPatch, pickModulePatch, stringArray } from "@/lib/input";

describe("pickLessonPatch", () => {
  it("只保留标题、简介、所属模块", () => {
    expect(pickLessonPatch({ title: "第一课", summary: "简介", section: "模块一" })).toEqual({ title: "第一课", summary: "简介", section: "模块一" });
  });
  it("丢掉 courseId、status 等不允许改的字段（防止把课时塞进别人的课程）", () => {
    expect(pickLessonPatch({ title: "x", courseId: "别人的课程", status: "OPEN", order: 0, id: "y" })).toEqual({ title: "x" });
  });
  it("类型不对的字段丢掉，不是对象时返回空", () => {
    expect(pickLessonPatch({ title: 123, summary: null })).toEqual({});
    expect(pickLessonPatch(null)).toEqual({});
    expect(pickLessonPatch("abc")).toEqual({});
    expect(pickLessonPatch([1, 2])).toEqual({});
  });
});

describe("pickModulePatch", () => {
  it("只保留标题和内容", () => {
    const data = { markdown: "# 你好" };
    expect(pickModulePatch({ title: "图文", data })).toEqual({ title: "图文", data });
  });
  it("丢掉 lessonId、type（防止把模块挪进别人的课时）", () => {
    expect(pickModulePatch({ lessonId: "别人的课时", type: "HTML", order: 3 })).toEqual({});
  });
  it("data 必须是对象", () => {
    expect(pickModulePatch({ data: "x" })).toEqual({});
    expect(pickModulePatch({ data: [1] })).toEqual({});
    expect(pickModulePatch({ data: null })).toEqual({});
  });
});

describe("其他检查", () => {
  it("isPlainObject", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
  });
  it("isLessonStatus", () => {
    expect(isLessonStatus("OPEN")).toBe(true);
    expect(isLessonStatus("SCHEDULED")).toBe(true);
    expect(isLessonStatus("open")).toBe(false);
    expect(isLessonStatus(undefined)).toBe(false);
  });
  it("stringArray 只留字符串", () => {
    expect(stringArray(["a", 1, null, "b"])).toEqual(["a", "b"]);
    expect(stringArray("a")).toEqual([]);
  });
});
