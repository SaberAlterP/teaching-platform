import "server-only";
import fs from "fs/promises";
import path from "path";
import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertLessonOwner, assertModuleOwner, createCourse, isLessonVisible } from "@/lib/course";
import { cleanupFiles, regradeSubmissions, validateQuiz, writeOrder } from "@/lib/content";
import type { HtmlData, ModuleType, QuizData } from "@/lib/modules";
import { assetDir, savePackage } from "@/lib/storage";
import type { ToolDef } from "./deepseek";
import { findSkill, listSkills } from "./skills";
import { draftInfo, draftPath, listDrafts, numbered, readDraft, staticCheck, writeDraft } from "./workspace";

// AI 助手能调用的工具。每个工具：给模型看的定义、运行前是否要老师确认、运行逻辑。
// 所有写入都只作用于该老师自己的课程，并记录到 ai_changes，方便撤销。

export type PreviewReport = { errors: string[]; scores: number[] };

export type ToolCtx = {
  teacherId: string;
  chatId: string;
  toolCallId: string;
  // 等老师浏览器里的预览跑完这个版本的草稿，返回运行时错误；老师没打开页面时返回 null
  waitForPreview: (file: string, version: number) => Promise<PreviewReport | null>;
};

export type ToolOutput = { result: unknown; label?: string; changeId?: string; file?: string };

type Args = Record<string, unknown>;
type Tool = {
  def: ToolDef["function"];
  label: (a: Args) => string;
  // 需要老师确认时返回一句说明（显示在确认卡片上），否则返回 null
  confirm?: (a: Args, ctx: ToolCtx) => Promise<string | null>;
  run: (a: Args, ctx: ToolCtx) => Promise<ToolOutput>;
};

class ToolError extends Error {}

// ---------- 参数读取 ----------
const s = (a: Args, k: string, required = true) => {
  const v = a[k];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`缺少参数 ${k}`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolError(`${k} 必须是字符串`);
  return v;
};
const n = (a: Args, k: string) => {
  const v = a[k];
  if (v === undefined || v === null || v === "") return undefined;
  const x = Number(v);
  if (!Number.isFinite(x)) throw new ToolError(`${k} 必须是数字`);
  return x;
};
const b = (a: Args, k: string) => (a[k] === undefined ? undefined : a[k] === true || a[k] === "true");
const ids = (a: Args, k: string) => {
  const v = a[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new ToolError(`${k} 必须是字符串数组`);
  return v as string[];
};

// ---------- 数据访问 ----------
async function ownCourse(teacherId: string, courseId: string) {
  const c = await db.query.courses.findFirst({ where: and(eq(schema.courses.id, courseId), eq(schema.courses.teacherId, teacherId)) });
  if (!c) throw new ToolError(`课程 ${courseId} 不存在或不属于你`);
  return c;
}
async function ownLesson(teacherId: string, lessonId: string) {
  try {
    return await assertLessonOwner(lessonId, teacherId);
  } catch {
    throw new ToolError(`课时 ${lessonId} 不存在或不属于你`);
  }
}
async function ownModule(teacherId: string, moduleId: string) {
  try {
    return await assertModuleOwner(moduleId, teacherId);
  } catch {
    throw new ToolError(`模块 ${moduleId} 不存在或不属于你`);
  }
}
const lessonModules = (lessonId: string) =>
  db.query.modules.findMany({ where: eq(schema.modules.lessonId, lessonId), orderBy: asc(schema.modules.order) });

// 已开放（或定时开放）的课时，学生能看到或即将看到，改动前要老师确认
const exposed = (l: { status: string }) => l.status === "OPEN" || l.status === "SCHEDULED";
const statusText = (l: { status: string; openAt: Date | null }) =>
  l.status === "OPEN" ? "已开放" : l.status === "SCHEDULED" ? (isLessonVisible(l) ? "已开放" : "定时开放") : "草稿";

async function record(
  ctx: ToolCtx,
  kind: string,
  targetId: string,
  label: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  const [row] = await db
    .insert(schema.aiChanges)
    .values({ chatId: ctx.chatId, toolCallId: ctx.toolCallId, kind, targetId, label, before, after })
    .returning({ id: schema.aiChanges.id });
  return row.id;
}

// 模型有时把 data 写成 JSON 字符串，或把图文直接写成字符串
function normalizeData(type: ModuleType, data: unknown): Record<string, unknown> {
  let d = data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      if (type === "RICHTEXT") d = { markdown: data };
    }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new ToolError("data 必须是对象");
  const o = d as Record<string, unknown>;
  if (type === "RICHTEXT") {
    if (typeof o.markdown !== "string") throw new ToolError("图文模块 data 需要 markdown 字段（字符串）");
    return { markdown: o.markdown };
  }
  if (type === "QUIZ") {
    const q = { allowRetry: o.allowRetry ?? true, showAnswers: o.showAnswers ?? true, questions: o.questions } as QuizData;
    if (!Array.isArray(q.questions)) throw new ToolError("习题模块 data 需要 questions 数组");
    const used = new Set<string>();
    q.questions = q.questions.map((x, i) => {
      let id = typeof x.id === "string" && x.id ? x.id : `q${i + 1}`;
      while (used.has(id)) id = `${id}_${i + 1}`;
      used.add(id);
      return { ...x, id, points: Number(x.points) > 0 ? Number(x.points) : 20 };
    });
    try {
      validateQuiz(q);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    return q as unknown as Record<string, unknown>;
  }
  if (type === "MEDIA") {
    if (typeof o.src !== "string") throw new ToolError("图片/视频模块 data 需要 src");
    return { kind: o.kind === "video" ? "video" : "image", src: o.src, caption: typeof o.caption === "string" ? o.caption : "" };
  }
  if (type === "HTML") {
    if (typeof o.assetId !== "string" || !o.assetId) throw new ToolError("互动模块请用 html_publish 发布，不要直接写 data");
    return { assetId: o.assetId, height: Number(o.height) || 700, scored: !!o.scored, maxScore: Number(o.maxScore) || 100, note: typeof o.note === "string" ? o.note : "" };
  }
  throw new ToolError("模块类型必须是 RICHTEXT / QUIZ / MEDIA / HTML");
}
const MODULE_TYPES = ["RICHTEXT", "QUIZ", "MEDIA", "HTML"];
function moduleType(v: unknown): ModuleType {
  if (!MODULE_TYPES.includes(v as string)) throw new ToolError("type 必须是 RICHTEXT / QUIZ / MEDIA");
  return v as ModuleType;
}

async function packageInfo(assetId: string) {
  const a = await db.query.assets.findFirst({ where: eq(schema.assets.id, assetId) });
  if (!a) return null;
  let files = 1;
  try {
    files = (await fs.readdir(assetDir(a.id), { recursive: true, withFileTypes: true })).filter((d) => d.isFile()).length;
  } catch {}
  return { filename: a.filename, sizeKB: Math.round(a.size / 1024), files, entry: a.entry };
}

// 在模块列表中插入/删除后重排顺序
async function insertModuleAt(lessonId: string, moduleId: string, index: number | undefined) {
  const list = (await lessonModules(lessonId)).map((m) => m.id).filter((x) => x !== moduleId);
  const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(index)));
  list.splice(at, 0, moduleId);
  await writeOrder(list);
}

const moduleSnapshot = (m: schema.Module) => ({ title: m.title, data: m.data });

// ---------- 工具 ----------
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const STR = (description: string) => ({ type: "string", description });
const NUM = (description: string) => ({ type: "number", description });
const BOOL = (description: string) => ({ type: "boolean", description });
const MODULE_SCHEMA = obj(
  {
    type: { type: "string", enum: ["RICHTEXT", "QUIZ", "MEDIA"], description: "模块类型" },
    title: STR("模块标题，例如 知识讲解、随堂小测"),
    data: { type: "object", description: "模块内容，格式见系统说明" },
  },
  ["type", "data"],
);

const TOOLS: Tool[] = [
  // ---- 读取 ----
  {
    def: { name: "list_courses", description: "列出老师的全部课程（id、名称、课时数）", parameters: obj({}) },
    label: () => "查看课程列表",
    async run(_a, ctx) {
      const cs = await db.query.courses.findMany({ where: eq(schema.courses.teacherId, ctx.teacherId), orderBy: asc(schema.courses.createdAt) });
      const counts = cs.length
        ? await db.select({ c: schema.lessons.courseId, n: count() }).from(schema.lessons).where(inArray(schema.lessons.courseId, cs.map((c) => c.id))).groupBy(schema.lessons.courseId)
        : [];
      const m = new Map(counts.map((x) => [x.c, x.n]));
      return { result: cs.map((c) => ({ id: c.id, title: c.title, description: c.description, lessons: m.get(c.id) ?? 0 })) };
    },
  },
  {
    def: {
      name: "get_course",
      description: "查看一门课程的全部课时（按顺序）：id、标题、所属模块 section、状态、每个课时的模块列表（不含内容）",
      parameters: obj({ course_id: STR("课程 ID") }, ["course_id"]),
    },
    label: () => "查看课程",
    async run(a, ctx) {
      const c = await ownCourse(ctx.teacherId, s(a, "course_id")!);
      const ls = await db.query.lessons.findMany({ where: eq(schema.lessons.courseId, c.id), orderBy: [asc(schema.lessons.order), asc(schema.lessons.createdAt)] });
      const ms = ls.length
        ? await db
            .select({ id: schema.modules.id, lessonId: schema.modules.lessonId, type: schema.modules.type, title: schema.modules.title })
            .from(schema.modules)
            .where(inArray(schema.modules.lessonId, ls.map((l) => l.id)))
            .orderBy(asc(schema.modules.order))
        : [];
      return {
        label: `查看课程《${c.title}》`,
        result: {
          course: { id: c.id, title: c.title, description: c.description },
          lessons: ls.map((l) => ({
            id: l.id, title: l.title, summary: l.summary, section: l.section, status: statusText(l),
            modules: ms.filter((m) => m.lessonId === l.id).map((m) => ({ id: m.id, type: m.type, title: m.title })),
          })),
        },
      };
    },
  },
  {
    def: {
      name: "get_lesson",
      description: "查看一个课时的全部内容：每个模块的 id、类型、标题和 data（含习题答案）。HTML 模块附带互动包信息。",
      parameters: obj({ lesson_id: STR("课时 ID") }, ["lesson_id"]),
    },
    label: () => "查看课时",
    async run(a, ctx) {
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      const ms = await lessonModules(l.id);
      const modules = [];
      for (const m of ms) {
        const x: Record<string, unknown> = { id: m.id, type: m.type, title: m.title, data: m.data };
        if (m.type === "HTML") x.package = await packageInfo((m.data as unknown as HtmlData).assetId);
        modules.push(x);
      }
      return {
        label: `查看课时《${l.title}》`,
        result: { id: l.id, courseId: l.courseId, title: l.title, summary: l.summary, section: l.section, status: statusText(l), modules },
      };
    },
  },
  {
    def: {
      name: "load_skill",
      description: "读取一个技能（规范说明）的全文。开始写课时、出题、做动画、建课之前，先读取对应技能并严格遵守。",
      parameters: obj({ name: STR("技能名称") }, ["name"]),
    },
    label: (a) => `读取技能「${a.name ?? ""}」`,
    async run(a, ctx) {
      const sk = await findSkill(ctx.teacherId, s(a, "name")!);
      if (!sk) {
        const all = (await listSkills(ctx.teacherId)).filter((x) => x.enabled).map((x) => x.name);
        throw new ToolError(`没有这个技能。可用技能：${all.join("、")}`);
      }
      return { label: `读取技能「${sk.name}」`, result: sk.content };
    },
  },

  // ---- 课程和课时 ----
  {
    def: {
      name: "create_course",
      description: "新建一门课程（自带一个默认班级）。返回课程 ID。",
      parameters: obj({ title: STR("课程名称"), description: STR("课程简介") }, ["title"]),
    },
    label: (a) => `新建课程《${a.title ?? ""}》`,
    async run(a, ctx) {
      const title = s(a, "title")!.trim().slice(0, 100);
      const c = await createCourse(ctx.teacherId, title, s(a, "description", false) ?? "");
      const changeId = await record(ctx, "course.create", c.id, `新建课程《${title}》`, null, { title });
      return { changeId, result: { id: c.id } };
    },
  },
  {
    def: {
      name: "update_course",
      description: "修改课程名称或简介",
      parameters: obj({ course_id: STR("课程 ID"), title: STR("新名称"), description: STR("新简介") }, ["course_id"]),
    },
    label: () => "修改课程信息",
    async run(a, ctx) {
      const c = await ownCourse(ctx.teacherId, s(a, "course_id")!);
      const patch = { title: s(a, "title", false)?.trim() || c.title, description: s(a, "description", false) ?? c.description };
      await db.update(schema.courses).set(patch).where(eq(schema.courses.id, c.id));
      const changeId = await record(ctx, "course.update", c.id, `修改课程《${patch.title}》信息`, { title: c.title, description: c.description }, patch);
      return { changeId, label: `修改课程《${patch.title}》信息`, result: { ok: true } };
    },
  },
  {
    def: {
      name: "create_lesson",
      description: "在课程里新建一个课时（草稿，学生看不到），可以同时写入全部图文和习题模块。HTML 动画之后用 html_publish 添加。返回课时 ID 和各模块 ID。",
      parameters: obj(
        {
          course_id: STR("课程 ID"),
          title: STR("课时标题，有编号时以编号开头，例如 3-4 编制车辆调度与配载方案"),
          summary: STR("一句话简介，40 字以内"),
          section: STR("所属模块名，同一模块的课时填相同的名字"),
          index: NUM("插入到课程的第几个位置（从 0 开始），不填则放在末尾"),
          modules: { type: "array", items: MODULE_SCHEMA, description: "按顺序的模块列表" },
        },
        ["course_id", "title"],
      ),
    },
    label: (a) => `新建课时《${a.title ?? ""}》`,
    async run(a, ctx) {
      const c = await ownCourse(ctx.teacherId, s(a, "course_id")!);
      const raw = a.modules === undefined ? [] : a.modules;
      if (!Array.isArray(raw)) throw new ToolError("modules 必须是数组");
      const mods = raw.map((m: Args, i) => {
        try {
          const type = moduleType(m?.type);
          return { type, title: typeof m.title === "string" ? m.title : "", data: normalizeData(type, m.data) };
        } catch (e) {
          throw new ToolError(`第 ${i + 1} 个模块：${(e as Error).message}`);
        }
      });
      const title = s(a, "title")!.trim().slice(0, 200) || "新课时";
      const [{ m }] = await db.select({ m: max(schema.lessons.order) }).from(schema.lessons).where(eq(schema.lessons.courseId, c.id));
      const l = await db.transaction(async (tx) => {
        const [l] = await tx
          .insert(schema.lessons)
          .values({ courseId: c.id, title, summary: s(a, "summary", false) ?? "", section: s(a, "section", false)?.trim() ?? "", order: (m ?? -1) + 1 })
          .returning();
        if (mods.length) await tx.insert(schema.modules).values(mods.map((x, i) => ({ lessonId: l.id, order: i, ...x })));
        return l;
      });
      const idx = n(a, "index");
      if (idx !== undefined) {
        const all = (await db.query.lessons.findMany({ where: eq(schema.lessons.courseId, c.id), orderBy: [asc(schema.lessons.order), asc(schema.lessons.createdAt)] }))
          .map((x) => x.id)
          .filter((x) => x !== l.id);
        all.splice(Math.max(0, Math.min(all.length, Math.floor(idx))), 0, l.id);
        await db.transaction(async (tx) => {
          for (let i = 0; i < all.length; i++) await tx.update(schema.lessons).set({ order: i }).where(eq(schema.lessons.id, all[i]));
        });
      }
      const created = await lessonModules(l.id);
      const changeId = await record(ctx, "lesson.create", l.id, `新建课时《${title}》`, null, { title, courseId: c.id });
      return { changeId, result: { id: l.id, modules: created.map((x) => ({ id: x.id, type: x.type, title: x.title })) } };
    },
  },
  {
    def: {
      name: "update_lesson",
      description: "修改课时的标题、简介、所属模块或开放状态。设为开放需要老师确认。",
      parameters: obj(
        {
          lesson_id: STR("课时 ID"),
          title: STR("新标题"),
          summary: STR("新简介"),
          section: STR("所属模块名"),
          status: { type: "string", enum: ["DRAFT", "OPEN", "SCHEDULED"], description: "DRAFT 草稿 / OPEN 开放 / SCHEDULED 定时开放" },
          open_at: STR("定时开放时间（ISO 格式，status 为 SCHEDULED 时必填）"),
        },
        ["lesson_id"],
      ),
    },
    label: () => "修改课时信息",
    async confirm(a, ctx) {
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      if (a.status === "OPEN" || a.status === "SCHEDULED") return `把课时《${l.title}》设为${a.status === "OPEN" ? "开放（学生立即可见）" : "定时开放"}`;
      if (exposed(l)) return `修改已开放课时《${l.title}》的标题/简介/分组`;
      return null;
    },
    async run(a, ctx) {
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      const before = { title: l.title, summary: l.summary, section: l.section, status: l.status, openAt: l.openAt?.toISOString() ?? null };
      const patch: Partial<typeof schema.lessons.$inferInsert> = {};
      const title = s(a, "title", false);
      if (title !== undefined) patch.title = title.trim() || l.title;
      const summary = s(a, "summary", false);
      if (a.summary !== undefined) patch.summary = summary ?? "";
      if (a.section !== undefined) patch.section = (s(a, "section", false) ?? "").trim();
      if (a.status !== undefined) {
        if (!["DRAFT", "OPEN", "SCHEDULED"].includes(a.status as string)) throw new ToolError("status 必须是 DRAFT / OPEN / SCHEDULED");
        patch.status = a.status as "DRAFT" | "OPEN" | "SCHEDULED";
        patch.openAt = null;
        if (a.status === "SCHEDULED") {
          const at = new Date(String(a.open_at ?? ""));
          if (isNaN(at.getTime())) throw new ToolError("定时开放需要 open_at（ISO 时间）");
          patch.openAt = at;
        }
      }
      await db.update(schema.lessons).set(patch).where(eq(schema.lessons.id, l.id));
      const after = { ...before, ...patch, openAt: patch.openAt !== undefined ? patch.openAt?.toISOString() ?? null : before.openAt };
      const label = `修改课时《${after.title}》${patch.status ? `（${patch.status === "OPEN" ? "开放" : patch.status === "DRAFT" ? "改为草稿" : "定时开放"}）` : ""}`;
      const changeId = await record(ctx, "lesson.update", l.id, label, before, after);
      return { changeId, label, result: { ok: true } };
    },
  },
  {
    def: {
      name: "reorder_lessons",
      description: "调整课程中课时的顺序，lesson_ids 必须包含该课程的全部课时",
      parameters: obj({ course_id: STR("课程 ID"), lesson_ids: { type: "array", items: { type: "string" }, description: "新顺序的课时 ID" } }, ["course_id", "lesson_ids"]),
    },
    label: () => "调整课时顺序",
    async confirm(a, ctx) {
      const c = await ownCourse(ctx.teacherId, s(a, "course_id")!);
      const ls = await db.query.lessons.findMany({ where: eq(schema.lessons.courseId, c.id) });
      return ls.some(exposed) ? `调整课程《${c.title}》的课时顺序（其中有已开放的课时，学生看到的顺序会变）` : null;
    },
    async run(a, ctx) {
      const c = await ownCourse(ctx.teacherId, s(a, "course_id")!);
      const want = ids(a, "lesson_ids");
      const ls = await db.query.lessons.findMany({ where: eq(schema.lessons.courseId, c.id), orderBy: [asc(schema.lessons.order), asc(schema.lessons.createdAt)] });
      const set = new Set(ls.map((l) => l.id));
      if (want.length !== set.size || !want.every((x) => set.has(x)) || new Set(want).size !== want.length)
        throw new ToolError("lesson_ids 必须恰好包含该课程的全部课时（先用 get_course 查看）");
      await db.transaction(async (tx) => {
        for (let i = 0; i < want.length; i++) await tx.update(schema.lessons).set({ order: i }).where(eq(schema.lessons.id, want[i]));
      });
      const changeId = await record(ctx, "lesson.reorder", c.id, `调整课程《${c.title}》的课时顺序`, { ids: ls.map((l) => l.id) }, { ids: want });
      return { changeId, result: { ok: true } };
    },
  },

  // ---- 模块 ----
  {
    def: {
      name: "add_module",
      description: "给课时添加一个图文 / 习题 / 图片视频模块（HTML 动画用 html_publish）",
      parameters: obj(
        {
          lesson_id: STR("课时 ID"),
          type: { type: "string", enum: ["RICHTEXT", "QUIZ", "MEDIA"] },
          title: STR("模块标题"),
          data: { type: "object", description: "模块内容" },
          index: NUM("插入位置（从 0 开始），不填则放在末尾"),
        },
        ["lesson_id", "type", "data"],
      ),
    },
    label: () => "添加模块",
    async confirm(a, ctx) {
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      return exposed(l) ? `给已开放课时《${l.title}》添加模块「${a.title ?? ""}」` : null;
    },
    async run(a, ctx) {
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      const type = moduleType(a.type);
      const data = normalizeData(type, a.data);
      const title = s(a, "title", false) ?? "";
      const [m] = await db.insert(schema.modules).values({ lessonId: l.id, type, title, data, order: 9999 }).returning();
      await insertModuleAt(l.id, m.id, n(a, "index"));
      const label = `在《${l.title}》添加模块「${title || type}」`;
      const changeId = await record(ctx, "module.create", m.id, label, null, moduleSnapshot(m));
      return { changeId, label, result: { id: m.id } };
    },
  },
  {
    def: {
      name: "update_module",
      description: "修改模块的标题或内容（data 整体替换，先用 get_lesson 读取原内容再改）",
      parameters: obj({ module_id: STR("模块 ID"), title: STR("新标题"), data: { type: "object", description: "完整的新内容" } }, ["module_id"]),
    },
    label: () => "修改模块",
    async confirm(a, ctx) {
      const m = await ownModule(ctx.teacherId, s(a, "module_id")!);
      const l = await ownLesson(ctx.teacherId, m.lessonId);
      return exposed(l) ? `修改已开放课时《${l.title}》中的模块「${m.title || m.type}」` : null;
    },
    async run(a, ctx) {
      const m = await ownModule(ctx.teacherId, s(a, "module_id")!);
      const l = await ownLesson(ctx.teacherId, m.lessonId);
      const patch: { title?: string; data?: Record<string, unknown> } = {};
      if (a.title !== undefined) patch.title = s(a, "title", false) ?? "";
      if (a.data !== undefined) patch.data = normalizeData(m.type, a.data);
      if (!Object.keys(patch).length) throw new ToolError("没有要修改的内容");
      await db.update(schema.modules).set(patch).where(eq(schema.modules.id, m.id));
      if (patch.data && m.type === "QUIZ") await regradeSubmissions(m.id, patch.data as unknown as QuizData);
      const label = `修改《${l.title}》的模块「${patch.title ?? m.title ?? m.type}」`;
      const changeId = await record(ctx, "module.update", m.id, label, moduleSnapshot(m), { title: patch.title ?? m.title, data: patch.data ?? m.data });
      return { changeId, label, result: { ok: true } };
    },
  },
  {
    def: {
      name: "delete_module",
      description: "删除一个模块（学生在该模块的作答也会删除）",
      parameters: obj({ module_id: STR("模块 ID") }, ["module_id"]),
    },
    label: () => "删除模块",
    async confirm(a, ctx) {
      const m = await ownModule(ctx.teacherId, s(a, "module_id")!);
      const l = await ownLesson(ctx.teacherId, m.lessonId);
      return exposed(l) ? `删除已开放课时《${l.title}》中的模块「${m.title || m.type}」（学生在这个模块的作答也会删除）` : null;
    },
    async run(a, ctx) {
      const m = await ownModule(ctx.teacherId, s(a, "module_id")!);
      const l = await ownLesson(ctx.teacherId, m.lessonId);
      const order = (await lessonModules(l.id)).findIndex((x) => x.id === m.id);
      await db.delete(schema.modules).where(eq(schema.modules.id, m.id));
      const label = `删除《${l.title}》的模块「${m.title || m.type}」`;
      const changeId = await record(ctx, "module.delete", m.id, label, { lessonId: l.id, index: order, type: m.type, title: m.title, data: m.data }, null);
      return { changeId, label, result: { ok: true } };
    },
  },
  {
    def: {
      name: "reorder_modules",
      description: "调整课时内模块的顺序，module_ids 必须包含该课时的全部模块",
      parameters: obj({ lesson_id: STR("课时 ID"), module_ids: { type: "array", items: { type: "string" } } }, ["lesson_id", "module_ids"]),
    },
    label: () => "调整模块顺序",
    async confirm(a, ctx) {
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      return exposed(l) ? `调整已开放课时《${l.title}》的模块顺序` : null;
    },
    async run(a, ctx) {
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      const want = ids(a, "module_ids");
      const cur = (await lessonModules(l.id)).map((m) => m.id);
      const set = new Set(cur);
      if (want.length !== set.size || !want.every((x) => set.has(x)) || new Set(want).size !== want.length)
        throw new ToolError("module_ids 必须恰好包含该课时的全部模块（先用 get_lesson 查看）");
      await writeOrder(want);
      const label = `调整《${l.title}》的模块顺序`;
      const changeId = await record(ctx, "module.reorder", l.id, label, { ids: cur }, { ids: want });
      return { changeId, label, result: { ok: true } };
    },
  },

  // ---- HTML 动画草稿区 ----
  {
    def: {
      name: "html_write",
      description: "在草稿区创建或整体覆盖一个 HTML 文件。内容较长时只写开头部分（不超过约 400 行），其余用 html_append 分段追加。",
      parameters: obj({ file: STR("文件名，例如 装车流程.html"), content: STR("文件内容") }, ["file", "content"]),
    },
    label: (a) => `写入草稿 ${a.file ?? ""}`,
    async run(a, ctx) {
      const file = s(a, "file")!;
      const info = await writeDraft(ctx.chatId, file, String(a.content ?? ""));
      return { file, label: `写入草稿 ${file}（${info.lines} 行）`, result: info };
    },
  },
  {
    def: {
      name: "html_append",
      description: "在草稿文件末尾追加一段内容（分段写长文件用）",
      parameters: obj({ file: STR("文件名"), content: STR("追加的内容") }, ["file", "content"]),
    },
    label: (a) => `续写草稿 ${a.file ?? ""}`,
    async run(a, ctx) {
      const file = s(a, "file")!;
      const old = await readDraft(ctx.chatId, file);
      const add = String(a.content ?? "");
      const info = await writeDraft(ctx.chatId, file, old + (old.endsWith("\n") || add.startsWith("\n") ? "" : "\n") + add);
      return { file, label: `续写草稿 ${file}（共 ${info.lines} 行）`, result: info };
    },
  },
  {
    def: {
      name: "html_edit",
      description: "替换草稿文件中的一段文字。old_text 必须从文件中原样复制（含缩进），且在文件中唯一；要替换所有出现处设 replace_all=true。",
      parameters: obj(
        { file: STR("文件名"), old_text: STR("要替换的原文"), new_text: STR("替换成的新内容"), replace_all: BOOL("替换所有出现处") },
        ["file", "old_text", "new_text"],
      ),
    },
    label: (a) => `修改草稿 ${a.file ?? ""}`,
    async run(a, ctx) {
      const file = s(a, "file")!;
      const text = await readDraft(ctx.chatId, file);
      const oldText = String(a.old_text ?? "");
      const newText = String(a.new_text ?? "");
      if (!oldText) throw new ToolError("old_text 不能为空");
      const times = text.split(oldText).length - 1;
      if (times === 0) throw new ToolError("文件中找不到 old_text。先用 html_search 或 html_view 看原文，原样复制（包括空格和缩进）");
      if (times > 1 && !b(a, "replace_all")) throw new ToolError(`old_text 在文件中出现了 ${times} 次，请多带一些上下文让它唯一，或设 replace_all=true`);
      const next = b(a, "replace_all") ? text.split(oldText).join(newText) : text.replace(oldText, () => newText);
      const info = await writeDraft(ctx.chatId, file, next);
      return { file, label: `修改草稿 ${file}`, result: { ...info, replaced: b(a, "replace_all") ? times : 1 } };
    },
  },
  {
    def: {
      name: "html_view",
      description: "带行号查看草稿文件的一段（每次最多 300 行）",
      parameters: obj({ file: STR("文件名"), start_line: NUM("起始行，默认 1"), end_line: NUM("结束行") }, ["file"]),
    },
    label: (a) => `查看草稿 ${a.file ?? ""}`,
    async run(a, ctx) {
      const text = await readDraft(ctx.chatId, s(a, "file")!);
      const start = n(a, "start_line") ?? 1;
      const end = Math.min(n(a, "end_line") ?? start + 299, start + 299);
      const v = numbered(text, start, end);
      return { result: `共 ${v.total} 行\n${v.text}` };
    },
  },
  {
    def: {
      name: "html_search",
      description: "在草稿文件中查找关键词，返回所在行号和内容（最多 50 处）",
      parameters: obj({ file: STR("文件名"), keyword: STR("关键词（普通文字，不是正则）") }, ["file", "keyword"]),
    },
    label: (a) => `在草稿中查找「${String(a.keyword ?? "").slice(0, 20)}」`,
    async run(a, ctx) {
      const text = await readDraft(ctx.chatId, s(a, "file")!);
      const kw = s(a, "keyword")!;
      const hits: string[] = [];
      text.split("\n").forEach((line, i) => {
        if (hits.length >= 50) return;
        const at = line.indexOf(kw);
        if (at < 0) return;
        const piece = line.length > 300 ? "…" + line.slice(Math.max(0, at - 120), at + kw.length + 120) + "…" : line;
        hits.push(`${i + 1}\t${piece}`);
      });
      return { result: hits.length ? hits.join("\n") : "没有找到" };
    },
  },
  {
    def: { name: "html_files", description: "列出本对话草稿区的全部文件", parameters: obj({}) },
    label: () => "查看草稿文件列表",
    async run(_a, ctx) {
      return { result: await listDrafts(ctx.chatId) };
    },
  },
  {
    def: {
      name: "html_check",
      description: "检查草稿：语法、平台约定（成绩上报、禁止外部资源和 localStorage），并在老师浏览器的预览里实际运行，报告脚本运行错误。发布前必须检查并修复所有问题。",
      parameters: obj({ file: STR("文件名") }, ["file"]),
    },
    label: (a) => `检查草稿 ${a.file ?? ""}`,
    async run(a, ctx) {
      const file = s(a, "file")!;
      const text = await readDraft(ctx.chatId, file);
      const info = await draftInfo(ctx.chatId, file);
      const st = staticCheck(text);
      const report = await ctx.waitForPreview(file, info.version);
      const runtime = report
        ? report.errors.length
          ? { 运行错误: report.errors }
          : { 运行: `在老师浏览器里运行 4 秒，没有报错${report.scores.length ? `；收到成绩上报 ${report.scores.join("、")}` : ""}` }
        : { 运行: "老师现在没有打开预览，只做了静态检查" };
      const bad = st.problems.length + (report?.errors.length ?? 0);
      return {
        file,
        label: `检查草稿 ${file}：${bad ? `${bad} 个问题` : "通过"}`,
        result: { 行数: info.lines, 大小KB: Math.round(info.size / 1024), 问题: st.problems, 建议: st.tips, ...runtime },
      };
    },
  },
  {
    def: {
      name: "html_open",
      description: "把课时里已有的 HTML 互动模块拷到草稿区，用来修改。改完用 html_publish 并传 module_id 替换原模块。",
      parameters: obj({ module_id: STR("HTML 模块 ID"), file: STR("草稿文件名，例如 原动画.html") }, ["module_id", "file"]),
    },
    label: () => "打开已有动画",
    async run(a, ctx) {
      const m = await ownModule(ctx.teacherId, s(a, "module_id")!);
      if (m.type !== "HTML") throw new ToolError("这个模块不是 HTML 互动模块");
      const assetId = (m.data as unknown as HtmlData).assetId;
      const asset = assetId ? await db.query.assets.findFirst({ where: eq(schema.assets.id, assetId) }) : null;
      if (!asset) throw new ToolError("这个模块还没有上传互动包");
      const all = (await fs.readdir(assetDir(asset.id), { recursive: true, withFileTypes: true })).filter((d) => d.isFile());
      if (all.length > 1) throw new ToolError(`这个互动包由 ${all.length} 个文件组成（zip 包），暂不支持在线修改`);
      const text = await fs.readFile(path.join(assetDir(asset.id), asset.entry), "utf8");
      const file = s(a, "file")!;
      const info = await writeDraft(ctx.chatId, file, text);
      const longLines = text.split("\n").filter((l) => l.length > 2000).length;
      return {
        file,
        label: `打开动画「${m.title || asset.filename}」到草稿 ${file}`,
        result: {
          ...info,
          说明: longLines
            ? `文件里有 ${longLines} 行很长的压缩代码（通常是打包进去的 three.js 或程序），不要改这些行；用 html_search 找到要改的文字再 html_edit`
            : "用 html_view / html_search 查看，html_edit 修改",
        },
      };
    },
  },
  {
    def: {
      name: "html_publish",
      description:
        "把草稿发布到课时：传 module_id 则替换该 HTML 模块的动画，否则在 lesson_id 课时新建一个 HTML 模块（默认放在最后一个习题模块之前）。发布前必须 html_check 通过。",
      parameters: obj(
        {
          file: STR("草稿文件名"),
          lesson_id: STR("课时 ID（新建模块时必填）"),
          module_id: STR("要替换的 HTML 模块 ID"),
          title: STR("模块标题，例如 互动动画：装车流程"),
          height: NUM("显示高度（像素），一般 680~720"),
          scored: BOOL("是否记录成绩（动画里有 tp:score 上报时为 true）"),
          max_score: NUM("满分，默认 100"),
          note: STR("给学生的一句说明"),
          index: NUM("新建模块的插入位置（从 0 开始）"),
        },
        ["file"],
      ),
    },
    label: (a) => `发布动画 ${a.file ?? ""}`,
    async confirm(a, ctx) {
      const mid = s(a, "module_id", false);
      const l = mid ? await ownLesson(ctx.teacherId, (await ownModule(ctx.teacherId, mid)).lessonId) : await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      return exposed(l) ? `把动画 ${a.file} 发布到已开放课时《${l.title}》${mid ? "（替换原动画）" : ""}` : null;
    },
    async run(a, ctx) {
      const file = s(a, "file")!;
      const text = await readDraft(ctx.chatId, file);
      const st = staticCheck(text);
      if (st.problems.length) throw new ToolError(`草稿还有问题，先修复再发布：${st.problems.join("；")}`);
      const buf = await fs.readFile(draftPath(ctx.chatId, file));
      const asset = await savePackage(new Blob([buf]).stream(), file);
      const mid = s(a, "module_id", false);
      const title = s(a, "title", false);
      if (mid) {
        const m = await ownModule(ctx.teacherId, mid);
        if (m.type !== "HTML") throw new ToolError("module_id 不是 HTML 模块");
        const l = await ownLesson(ctx.teacherId, m.lessonId);
        const old = m.data as unknown as HtmlData;
        const data = {
          ...old,
          assetId: asset.id,
          height: n(a, "height") ?? old.height,
          scored: b(a, "scored") ?? old.scored,
          maxScore: n(a, "max_score") ?? old.maxScore ?? 100,
          note: s(a, "note", false) ?? old.note ?? "",
        };
        await db.update(schema.modules).set({ data, ...(title !== undefined ? { title } : {}) }).where(eq(schema.modules.id, m.id));
        await cleanupFiles();
        const label = `更新《${l.title}》的动画「${title ?? m.title}」`;
        const changeId = await record(ctx, "module.update", m.id, label, moduleSnapshot(m), { title: title ?? m.title, data });
        return { changeId, file, label, result: { module_id: m.id, lesson_id: l.id } };
      }
      const l = await ownLesson(ctx.teacherId, s(a, "lesson_id")!);
      const data = {
        assetId: asset.id,
        height: n(a, "height") ?? 700,
        scored: b(a, "scored") ?? /tp:score/.test(text),
        maxScore: n(a, "max_score") ?? 100,
        note: s(a, "note", false) ?? "",
      };
      const mods = await lessonModules(l.id);
      let index = n(a, "index");
      if (index === undefined) {
        const lastQuiz = mods.map((x) => x.type).lastIndexOf("QUIZ");
        index = lastQuiz >= 0 ? lastQuiz : mods.length;
      }
      const [m] = await db
        .insert(schema.modules)
        .values({ lessonId: l.id, type: "HTML", title: title ?? file.replace(/\.html$/, ""), data, order: 9999 })
        .returning();
      await insertModuleAt(l.id, m.id, index);
      const label = `在《${l.title}》添加动画「${m.title}」`;
      const changeId = await record(ctx, "module.create", m.id, label, null, moduleSnapshot(m));
      return { changeId, file, label, result: { module_id: m.id, lesson_id: l.id } };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.def.name, t]));

export const TOOL_DEFS: ToolDef[] = TOOLS.map((t) => ({ type: "function", function: t.def }));

export function parseArgs(raw: string): Args | null {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function toolLabel(name: string, raw: string) {
  const t = BY_NAME.get(name);
  if (!t) return name;
  try {
    return t.label(parseArgs(raw) ?? {});
  } catch {
    return t.def.name;
  }
}

export async function toolConfirm(name: string, args: Args, ctx: ToolCtx) {
  const t = BY_NAME.get(name);
  if (!t?.confirm) return null;
  try {
    return await t.confirm(args, ctx);
  } catch {
    return null; // 参数有问题时交给 run 报错
  }
}

// 运行工具，返回给模型的文字结果和界面显示信息
export async function runTool(name: string, args: Args, ctx: ToolCtx): Promise<ToolOutput & { ok: boolean; text: string }> {
  const t = BY_NAME.get(name);
  if (!t) return { ok: false, result: null, text: JSON.stringify({ error: `没有工具 ${name}` }) };
  try {
    const out = await t.run(args, ctx);
    const text = typeof out.result === "string" ? out.result : JSON.stringify(out.result);
    return { ...out, ok: true, text };
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : `出错了：${(e as Error).message}`;
    if (!(e instanceof ToolError)) console.error("AI 工具出错", name, e);
    return { ok: false, result: null, text: JSON.stringify({ error: msg }), label: `${t.label(args)}：失败` };
  }
}
