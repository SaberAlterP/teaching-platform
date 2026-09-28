// 数据模型：老师 → 课程 → 班级 → 学生
// 第一期界面只用到单老师、单课程、单班级，但表结构已支持扩展。
import {
  pgTable, pgEnum, text, timestamp, boolean, integer, real, jsonb, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "../lib/id";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date());

export const roleEnum = pgEnum("role", ["TEACHER", "STUDENT"]);
// DRAFT 草稿（学生不可见）/ OPEN 已开放 / SCHEDULED 定时开放（到 openAt 自动可见）
export const lessonStatusEnum = pgEnum("lesson_status", ["DRAFT", "OPEN", "SCHEDULED"]);
// RICHTEXT 图文 / MEDIA 图片视频 / QUIZ 习题 / HTML 包（游戏、动画，沙箱运行）
export const moduleTypeEnum = pgEnum("module_type", ["RICHTEXT", "MEDIA", "QUIZ", "HTML"]);

export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(), // 学生用学号
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("STUDENT"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const courses = pgTable("courses", {
  id: id(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  teacherId: text("teacher_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const classes = pgTable("classes", {
  id: id(),
  name: text("name").notNull(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const enrollments = pgTable(
  "enrollments",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    classId: text("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.classId] }), index("enrollments_class_idx").on(t.classId)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: id(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    order: integer("order").notNull().default(0),
    status: lessonStatusEnum("status").notNull().default("DRAFT"),
    openAt: timestamp("open_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lessons_course_idx").on(t.courseId)],
);

export const modules = pgTable(
  "modules",
  {
    id: id(),
    lessonId: text("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    type: moduleTypeEnum("type").notNull(),
    title: text("title").notNull().default(""),
    // 各类型的具体内容，结构见 src/lib/modules.ts
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("modules_lesson_idx").on(t.lessonId)],
);

// 学生对习题模块 / 可计分 HTML 模块的作答（每人每模块一条，重做会覆盖）
export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
    answers: jsonb("answers").notNull().$type<Record<string, unknown>>(),
    // 每题得分；null 表示主观题待批改
    itemScores: jsonb("item_scores").notNull().default({}).$type<Record<string, number | null>>(),
    score: real("score").notNull().default(0),
    maxScore: real("max_score").notNull().default(0),
    needsGrading: boolean("needs_grading").notNull().default(false),
    attempts: integer("attempts").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("submissions_user_module").on(t.userId, t.moduleId),
    // 按模块查作答（统计、批改、重新判分）
    index("submissions_module_idx").on(t.moduleId),
  ],
);

// 学习进度：学生完成了哪些模块
export const moduleProgress = pgTable(
  "module_progress",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
    completedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.moduleId] }), index("module_progress_module_idx").on(t.moduleId)],
);

// 上传的文件：普通文件（图片、视频）或 HTML 包（解压后的目录）
export const assets = pgTable("assets", {
  id: id(),
  kind: text("kind").notNull().$type<"file" | "package">(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  entry: text("entry").notNull().default("index.html"),
  createdAt: createdAt(),
});

// AI 接口密钥：老师生成后交给 Claude 等 AI 助手，用来通过 /api/ai 读写课程内容。
// 只保存哈希；明文只在生成时显示一次。
export const apiKeys = pgTable("api_keys", {
  id: id(),
  teacherId: text("teacher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(), // 密钥开头几位，方便老师辨认
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const lessonsRelations = relations(lessons, ({ many }) => ({ modules: many(modules) }));
export const modulesRelations = relations(modules, ({ one }) => ({
  lesson: one(lessons, { fields: [modules.lessonId], references: [lessons.id] }),
}));

export type User = typeof users.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
