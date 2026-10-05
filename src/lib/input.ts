// Server Action 的入参检查。
// Server Action 本质上是公开的接口：参数的 TypeScript 类型在运行时不起作用，浏览器里可以传任意 JSON。
// 所以凡是要直接写进数据库的对象，都只挑出允许的字段，类型不对的丢掉。

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// 课时：老师在编辑页只能改这三项（状态、所属课程有各自的操作，并且会做权限检查）
export function pickLessonPatch(p: unknown) {
  const out: { title?: string; summary?: string; section?: string } = {};
  if (!isPlainObject(p)) return out;
  if (typeof p.title === "string") out.title = p.title;
  if (typeof p.summary === "string") out.summary = p.summary;
  if (typeof p.section === "string") out.section = p.section;
  return out;
}

// 模块：只能改标题和内容（不能改类型、所属课时）
export function pickModulePatch(p: unknown) {
  const out: { title?: string; data?: Record<string, unknown> } = {};
  if (!isPlainObject(p)) return out;
  if (typeof p.title === "string") out.title = p.title;
  if (isPlainObject(p.data)) out.data = p.data;
  return out;
}

export const LESSON_STATUSES = ["DRAFT", "OPEN", "SCHEDULED"] as const;
export const isLessonStatus = (v: unknown): v is (typeof LESSON_STATUSES)[number] =>
  (LESSON_STATUSES as readonly unknown[]).includes(v);

export const stringArray = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
