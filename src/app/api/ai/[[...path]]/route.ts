import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { teacherFromRequest } from "@/lib/api-key";
import { assertLessonOwner, assertModuleOwner, createCourse, getTeacherCourse, listTeacherCourses } from "@/lib/course";
import { cleanupFiles, regradeSubmissions, validateQuiz, writeOrder } from "@/lib/content";
import { defaultData, type ModuleType, type QuizData } from "@/lib/modules";
import { MAX_FILE, MAX_PACKAGE, saveFile, savePackage } from "@/lib/storage";

// AI 接口：老师在“AI 接口”页面生成密钥，交给 Claude 等 AI 助手读写该老师所有课程的内容。
// 请求头：Authorization: Bearer tpk_...
// 能做：列出和新建课程、读课程和课时、新建和修改（包括移课程）课时、增删改模块、调整顺序、上传文件和 HTML 包。
// 不能：删除课时、访问学生账号和成绩。
// GET /api/ai 不需要密钥，返回下面的使用说明。

const HELP = {
  说明:
    "教学实训平台 AI 接口。除本说明外，所有请求都要带请求头 Authorization: Bearer <密钥>，请求体为 JSON。老师可以有多门课程：/course 和新建课时默认操作第一门课，加查询参数 ?course=<课程ID> 指定其他课程。",
  接口: {
    "GET /api/ai/courses": "全部课程列表（id、名称、简介、课时数）",
    "POST /api/ai/courses": "{ title, description? } 新建课程，返回 id",
    "GET /api/ai/course?course=<ID>": "课程信息和全部课时（含每个课时的模块列表，不含模块内容）",
    "PATCH /api/ai/course?course=<ID>": "{ title?, description? } 修改课程名称、简介",
    "PUT /api/ai/course/order?course=<ID>": "{ ids: [课时ID...] } 调整课时顺序",
    "POST /api/ai/lessons?course=<ID>": "{ title, summary?, modules?: [{ type, title?, data }] } 在该课程新建课时（默认草稿状态）",
    "GET /api/ai/lessons/:id": "课时详情和全部模块（含习题答案）",
    "PATCH /api/ai/lessons/:id": "{ title?, summary?, status?: DRAFT|OPEN|SCHEDULED, openAt?: ISO时间, courseId? } 修改课时；courseId 把课时移到另一门课程末尾",
    "PUT /api/ai/lessons/:id/order": "{ ids: [模块ID...] } 调整模块顺序（必须包含该课时全部模块）",
    "POST /api/ai/lessons/:id/modules": "{ type, title?, data?, index? } 添加模块，index 为插入位置（默认末尾）",
    "PATCH /api/ai/modules/:id": "{ title?, data? } 修改模块；data 整体替换",
    "DELETE /api/ai/modules/:id": "删除模块（会同时删除学生在该模块的作答）",
    "POST /api/ai/upload?kind=file|package&name=文件名":
      "请求体直接是文件内容。file：图片/视频（≤200MB），返回 url 填到 MEDIA 模块 data.src；package：.html 或 .zip（≤100MB），返回 id 填到 HTML 模块 data.assetId",
  },
  模块类型: {
    RICHTEXT: "{ markdown }",
    MEDIA: '{ kind: "image"|"video", src, caption? }',
    QUIZ:
      '{ questions: [{ id, type: "single"|"multi"|"fill"|"short", prompt, options?, answer?, points, explanation? }], allowRetry, showAnswers }；single 答案为选项下标，multi 为下标数组，fill 为可接受答案数组，short 为参考答案文字',
    HTML: "{ assetId, height, scored, maxScore?, note? }；包内用 parent.postMessage({ type: 'tp:score', score, max }, '*') 上报成绩",
  },
};

const MODULE_TYPES: ModuleType[] = ["RICHTEXT", "MEDIA", "QUIZ", "HTML"];

class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Teacher = NonNullable<Awaited<ReturnType<typeof teacherFromRequest>>>;
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const path = (await ctx.params).path ?? [];
  const method = req.method;
  if (!path.length && method === "GET") return NextResponse.json(HELP);

  const t = await teacherFromRequest(req);
  if (!t) return NextResponse.json({ error: "密钥无效或已撤销" }, { status: 401 });
  try {
    const result = await route(req, method, path, t);
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : /不存在|无权限/.test((e as Error).message) ? 404 : 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b;
  } catch {}
  throw new ApiError("请求体必须是 JSON 对象");
}

const str = (v: unknown, field: string) => {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new ApiError(`${field} 必须是字符串`);
  return v;
};

function checkModule(type: unknown, data: unknown): { type: ModuleType; data: Record<string, unknown> } {
  if (!MODULE_TYPES.includes(type as ModuleType)) throw new ApiError(`模块类型必须是 ${MODULE_TYPES.join("/")}`);
  const d = data === undefined ? defaultData(type as ModuleType) : data;
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new ApiError("data 必须是对象");
  if (type === "QUIZ") validateQuiz(d as QuizData);
  return { type: type as ModuleType, data: d as Record<string, unknown> };
}

function done(lessonId?: string) {
  revalidatePath("/teacher", "layout");
  if (lessonId) revalidatePath(`/learn/${lessonId}`);
}

async function route(req: Request, method: string, path: string[], t: Teacher) {
  const [a, id, sub] = path;
  const { course } = await getTeacherCourse(t.id, new URL(req.url).searchParams.get("course") || undefined);

  // ---- 课程 ----
  if (a === "courses" && !id && method === "GET") {
    const all = await listTeacherCourses(t.id);
    const counts = await db
      .select({ courseId: schema.lessons.courseId, n: count() })
      .from(schema.lessons)
      .where(inArray(schema.lessons.courseId, all.map((c) => c.id)))
      .groupBy(schema.lessons.courseId);
    const n = new Map(counts.map((c) => [c.courseId, c.n]));
    return { courses: all.map((c) => ({ id: c.id, title: c.title, description: c.description, lessons: n.get(c.id) ?? 0 })) };
  }
  if (a === "courses" && !id && method === "POST") {
    const b = await body(req);
    const c = await createCourse(t.id, str(b.title, "title")?.trim() || "新课程", str(b.description, "description") ?? "");
    done();
    return { id: c.id };
  }
  if (a === "course" && !id && method === "GET") {
    const lessons = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.courseId, course.id))
      .orderBy(asc(schema.lessons.order), asc(schema.lessons.createdAt));
    const mods = lessons.length
      ? await db
          .select({ id: schema.modules.id, lessonId: schema.modules.lessonId, type: schema.modules.type, title: schema.modules.title })
          .from(schema.modules)
          .where(inArray(schema.modules.lessonId, lessons.map((l) => l.id)))
          .orderBy(asc(schema.modules.order))
      : [];
    return {
      course: { id: course.id, title: course.title, description: course.description },
      lessons: lessons.map((l) => ({
        id: l.id, title: l.title, summary: l.summary, status: l.status, openAt: l.openAt, updatedAt: l.updatedAt,
        modules: mods.filter((m) => m.lessonId === l.id).map((m) => ({ id: m.id, type: m.type, title: m.title })),
      })),
    };
  }
  if (a === "course" && !id && method === "PATCH") {
    const b = await body(req);
    const patch = { title: str(b.title, "title")?.trim() || undefined, description: str(b.description, "description") };
    await db.update(schema.courses).set(patch).where(eq(schema.courses.id, course.id));
    done();
    return;
  }
  if (a === "course" && id === "order" && method === "PUT") {
    const ids = (await body(req)).ids;
    if (!Array.isArray(ids)) throw new ApiError("ids 必须是数组");
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++)
        await tx
          .update(schema.lessons)
          .set({ order: i })
          .where(and(eq(schema.lessons.id, String(ids[i])), eq(schema.lessons.courseId, course.id)));
    });
    done();
    return;
  }

  // ---- 课时 ----
  if (a === "lessons" && !id && method === "POST") {
    const b = await body(req);
    const mods = b.modules === undefined ? [] : b.modules;
    if (!Array.isArray(mods)) throw new ApiError("modules 必须是数组");
    const checked = mods.map((m: Record<string, unknown>, i) => {
      try {
        return { ...checkModule(m?.type, m?.data), title: str(m?.title, "title") ?? "" };
      } catch (e) {
        throw new ApiError(`第 ${i + 1} 个模块：${(e as Error).message}`);
      }
    });
    const [{ m }] = await db.select({ m: max(schema.lessons.order) }).from(schema.lessons).where(eq(schema.lessons.courseId, course.id));
    const l = await db.transaction(async (tx) => {
      const [l] = await tx
        .insert(schema.lessons)
        .values({ courseId: course.id, title: str(b.title, "title")?.trim() || "新课时", summary: str(b.summary, "summary") ?? "", order: (m ?? -1) + 1 })
        .returning();
      if (checked.length)
        await tx.insert(schema.modules).values(checked.map((x, i) => ({ lessonId: l.id, order: i, ...x })));
      return l;
    });
    done();
    return { id: l.id };
  }
  if (a === "lessons" && id && !sub && method === "GET") {
    const l = await assertLessonOwner(id, t.id);
    const mods = await db.query.modules.findMany({ where: eq(schema.modules.lessonId, id), orderBy: asc(schema.modules.order) });
    return {
      id: l.id, title: l.title, summary: l.summary, status: l.status, openAt: l.openAt,
      modules: mods.map((x) => ({ id: x.id, type: x.type, title: x.title, data: x.data })),
    };
  }
  if (a === "lessons" && id && !sub && method === "PATCH") {
    await assertLessonOwner(id, t.id);
    const b = await body(req);
    const patch: Partial<typeof schema.lessons.$inferInsert> = {};
    if (b.title !== undefined) patch.title = str(b.title, "title")!.trim() || "新课时";
    if (b.summary !== undefined) patch.summary = str(b.summary, "summary");
    if (b.courseId !== undefined) {
      const { course: target } = await getTeacherCourse(t.id, str(b.courseId, "courseId"));
      const [{ m }] = await db.select({ m: max(schema.lessons.order) }).from(schema.lessons).where(eq(schema.lessons.courseId, target.id));
      patch.courseId = target.id;
      patch.order = (m ?? -1) + 1;
    }
    if (b.status !== undefined) {
      if (!["DRAFT", "OPEN", "SCHEDULED"].includes(b.status as string)) throw new ApiError("status 必须是 DRAFT/OPEN/SCHEDULED");
      patch.status = b.status as "DRAFT" | "OPEN" | "SCHEDULED";
      patch.openAt = null;
      if (b.status === "SCHEDULED") {
        const at = new Date(String(b.openAt ?? ""));
        if (isNaN(at.getTime())) throw new ApiError("定时开放需要 openAt（ISO 时间）");
        patch.openAt = at;
      }
    }
    await db.update(schema.lessons).set(patch).where(eq(schema.lessons.id, id));
    done(id);
    return;
  }
  if (a === "lessons" && id && sub === "order" && method === "PUT") {
    await assertLessonOwner(id, t.id);
    const ids = (await body(req)).ids;
    if (!Array.isArray(ids)) throw new ApiError("ids 必须是数组");
    const own = await db.select({ id: schema.modules.id }).from(schema.modules).where(eq(schema.modules.lessonId, id));
    const set = new Set(own.map((x) => x.id));
    if (ids.length !== set.size || !ids.every((x) => set.has(String(x))) || new Set(ids).size !== ids.length)
      throw new ApiError("ids 必须恰好包含该课时的全部模块");
    await writeOrder(ids.map(String));
    done(id);
    return;
  }
  if (a === "lessons" && id && sub === "modules" && method === "POST") {
    await assertLessonOwner(id, t.id);
    const b = await body(req);
    const { type, data } = checkModule(b.type, b.data);
    const existing = await db.query.modules.findMany({ where: eq(schema.modules.lessonId, id), orderBy: asc(schema.modules.order) });
    const idx = typeof b.index === "number" ? Math.max(0, Math.min(existing.length, Math.floor(b.index))) : existing.length;
    const [mod] = await db
      .insert(schema.modules)
      .values({ lessonId: id, type, title: str(b.title, "title") ?? "", data, order: idx })
      .returning();
    const ids = existing.map((x) => x.id);
    ids.splice(idx, 0, mod.id);
    await writeOrder(ids);
    done(id);
    return { id: mod.id };
  }

  // ---- 模块 ----
  if (a === "modules" && id && !sub && method === "PATCH") {
    const m = await assertModuleOwner(id, t.id);
    const b = await body(req);
    const patch: { title?: string; data?: Record<string, unknown> } = {};
    if (b.title !== undefined) patch.title = str(b.title, "title");
    if (b.data !== undefined) patch.data = checkModule(m.type, b.data).data;
    await db.update(schema.modules).set(patch).where(eq(schema.modules.id, id));
    if (patch.data) {
      if (m.type === "QUIZ") await regradeSubmissions(id, patch.data as unknown as QuizData);
      else await cleanupFiles();
    }
    done(m.lessonId);
    return;
  }
  if (a === "modules" && id && !sub && method === "DELETE") {
    const m = await assertModuleOwner(id, t.id);
    await db.delete(schema.modules).where(eq(schema.modules.id, id));
    await cleanupFiles();
    done(m.lessonId);
    return;
  }

  // ---- 上传 ----
  if (a === "upload" && !id && method === "POST") {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") === "package" ? "package" : "file";
    const filename = (url.searchParams.get("name") ?? "").trim().slice(0, 200) || "未命名";
    const limit = kind === "package" ? MAX_PACKAGE : MAX_FILE;
    if (Number(req.headers.get("content-length") ?? 0) > limit)
      throw new ApiError(`文件超过 ${Math.round(limit / 1024 / 1024)}MB`, 413);
    if (!req.body) throw new ApiError("没有文件");
    const row =
      kind === "package"
        ? await savePackage(req.body, filename)
        : await saveFile(req.body, filename, req.headers.get("content-type") ?? "");
    return {
      id: row.id,
      filename: row.filename,
      url: row.kind === "package" ? `/pkg/${row.id}/${row.entry}` : `/api/files/${row.id}`,
    };
  }

  throw new ApiError("没有这个接口，GET /api/ai 查看说明", 404);
}
