// 数据模型：老师 → 课程 → 班级 → 学生
// 每位老师可有多门课程，每门课目前用一个班级；表结构也支持多老师、多班级。
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
  // 管理员是叠加在角色上的标记：老师可以同时是管理员，管理员负责全站 AI 设置并查看各老师用量
  isAdmin: boolean("is_admin").notNull().default(false),
  email: text("email").unique(), // 自助注册的老师填写，可用邮箱登录
  // 自助注册的老师默认待批准（approved=false）；已有账号和管理员创建的账号都是 true
  approved: boolean("approved").notNull().default(true),
  theme: text("theme").notNull().default(""), // 教师工作台主题，空 = 默认
  onboarded: boolean("onboarded").notNull().default(false), // 老师是否已看过新手引导
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
    // 所属模块/章节名，课时列表按它分组；空表示不分组
    section: text("section").notNull().default(""),
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

// ---- AI 助手（DeepSeek）----
// 每位老师的 DeepSeek 设置；密钥用 AUTH_SECRET 派生的密钥加密保存
export const aiSettings = pgTable("ai_settings", {
  teacherId: text("teacher_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  apiKeyEnc: text("api_key_enc").notNull().default(""),
  apiKeyHint: text("api_key_hint").notNull().default(""), // 密钥开头几位，方便辨认
  model: text("model").notNull().default("deepseek-flash"),
  baseUrl: text("base_url").notNull().default("https://api.deepseek.com"),
  thinking: boolean("thinking").notNull().default(true),
  updatedAt: updatedAt(),
});

// 全站统一的 DeepSeek 设置（只有一行，id 固定为 global），由管理员维护
export const aiGlobalSettings = pgTable("ai_global_settings", {
  id: text("id").primaryKey().default("global"),
  apiKeyEnc: text("api_key_enc").notNull().default(""),
  apiKeyHint: text("api_key_hint").notNull().default(""),
  model: text("model").notNull().default("deepseek-flash"),
  baseUrl: text("base_url").notNull().default("https://api.deepseek.com"),
  thinking: boolean("thinking").notNull().default(true),
  updatedAt: updatedAt(),
});

// 全站设置（单行）：老师自助注册的开放方式 approval 需批准 / open 直接开通 / closed 关闭
export const siteSettings = pgTable("site_settings", {
  id: text("id").primaryKey().default("global"),
  teacherSignup: text("teacher_signup").notNull().default("approval"),
  updatedAt: updatedAt(),
});

// 每次调用 DeepSeek 记一条，用来按老师、按日统计 token 用量
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: id(),
    teacherId: text("teacher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    chatId: text("chat_id"), // 对话被删后仍保留用量，所以不加外键
    model: text("model").notNull().default(""),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_teacher_time_idx").on(t.teacherId, t.createdAt), index("ai_usage_time_idx").on(t.createdAt)],
);

// 一次对话：完整消息记录（发给模型的格式）和运行状态
export const aiChats = pgTable(
  "ai_chats",
  {
    id: id(),
    teacherId: text("teacher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("新对话"),
    courseId: text("course_id"), // 对话开始时老师所在的课程
    lessonId: text("lesson_id"), // 从课时编辑页打开时的课时
    messages: jsonb("messages").notNull().default([]).$type<unknown[]>(),
    // idle / queued / running / waiting（等老师确认）/ stopped / error
    status: text("status").notNull().default("idle"),
    error: text("error").notNull().default(""),
    pending: jsonb("pending").$type<{ toolCallId: string; name: string; summary: string } | null>(),
    decisions: jsonb("decisions").notNull().default({}).$type<Record<string, "approve" | "reject">>(),
    notes: jsonb("notes").notNull().default([]).$type<string[]>(), // 下一条消息要告诉 AI 的事（例如老师撤销了哪些改动）
    usage: jsonb("usage").notNull().default({}).$type<Record<string, number>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_chats_teacher_idx").on(t.teacherId)],
);

// AI 做的每一次改动，保存改动前后的内容，用于撤销
export const aiChanges = pgTable(
  "ai_changes",
  {
    id: id(),
    chatId: text("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    kind: text("kind").notNull(), // module.create / module.update / module.delete / module.reorder / lesson.* / course.*
    targetId: text("target_id").notNull(),
    label: text("label").notNull().default(""),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    undone: boolean("undone").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("ai_changes_chat_idx").on(t.chatId)],
);

// 技能：写给 AI 的规范说明。内置技能在代码里（src/lib/ai/skills.ts），老师修改后的版本和自建技能存这里
export const aiSkills = pgTable(
  "ai_skills",
  {
    id: id(),
    teacherId: text("teacher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(), // 内置技能的标识，或自建技能的名称
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    content: text("content").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("ai_skills_teacher_slug").on(t.teacherId, t.slug)],
);

export const lessonsRelations = relations(lessons, ({ many }) => ({ modules: many(modules) }));
export const modulesRelations = relations(modules, ({ one }) => ({
  lesson: one(lessons, { fields: [modules.lessonId], references: [lessons.id] }),
}));

export type User = typeof users.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type AiChat = typeof aiChats.$inferSelect;
export type AiChange = typeof aiChanges.$inferSelect;
