import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import template2d from "./template-2d.html";
import template3d from "./template-3d.html";

// 技能：写给 AI 的规范说明。系统提示里只列出名称和一句话说明，AI 需要时用 load_skill 读取全文。
// 内置技能写在这里；老师在“技能”页修改后，修改版存数据库（同 slug 覆盖内置版），“恢复默认”即删除修改版。

export type Skill = { slug: string; name: string; description: string; content: string; enabled: boolean; builtin: boolean; modified: boolean };

type Builtin = { slug: string; name: string; description: string; content: string };

export const BUILTIN_SKILLS: Builtin[] = [
  {
    slug: "lesson-writing",
    name: "课时编写",
    description: "写或改课时正文（图文模块）时使用：结构、字数、语言风格、Markdown 写法",
    content: `# 课时编写规范

面向高职学生，简体中文，语言清楚、贴近岗位。每个课时通常由这些模块组成（按顺序）：

1. 图文「学习目标与情境导入」：3~4 条学习目标（知识 / 技能 / 素养），再用 150~250 字的岗位情境引入（例如某物流公司调度员接到任务），场景可以虚构但要合理。
2. 图文「知识讲解」：覆盖大纲要求的全部知识点，按流程或场景组织 ### 小标题；1500~2500 字；多用对比表、步骤列表、示例计算（计算题给出完整步骤）。
3. 图文「技能要点与课堂任务」：把技能点写成可操作的步骤或检查清单；给 1 个课上能完成的课堂任务，说明学生要交什么；最后一小段「思政与赛证」2~4 句，自然不说教。
4. （可选）HTML 互动动画：放在随堂小测之前。
5. 习题「随堂小测」：见「出题规范」技能。

## Markdown 写法
- 可用 ### 小标题、列表、表格、**加粗**、> 引用。不要用一级标题（模块标题已经是标题）。
- 表格单元格里换行用 <br>，其他 HTML 标签不会显示。
- 不要写「动画见下方」之类还不存在的资源；不要写技术实现（Three.js 等）。

## 事实准确
法规、费率、数据只写有把握的；不确定的数字写成「示例数据」或给出范围，不要编造政策文号。

## 课时本身
- 标题：有任务编号时以编号开头，例如「3-4 编制车辆调度与配载方案」。
- summary：一句话简介，40 字以内，学生在课程列表里看到。
- section：所属模块名（例如「模块三 公路运输组织」），同一模块的课时填相同的名字，课时列表会把它们折叠成一组。`,
  },
  {
    slug: "quiz",
    name: "出题规范",
    description: "出随堂小测、改习题模块时使用：题型、分值、答案格式、解析",
    content: `# 出题规范（习题模块 QUIZ）

data 格式：{ "allowRetry": true, "showAnswers": true, "questions": [ ... ] }

每道题：
- single 单选：{ "id": "q1", "type": "single", "prompt": "题干", "options": ["A","B","C","D"], "answer": 1, "points": 20, "explanation": "解析" }，answer 是正确选项的下标（从 0 开始）。
- multi 多选：answer 是下标数组，例如 [0, 2]。
- fill 填空：answer 是可接受答案的数组，例如 ["整车", "整车运输"]；答案要短而唯一，比较时忽略空格和大小写。
- short 简答：answer 是参考答案文字，需要老师人工批改。随堂小测不要用。

要求：
- 随堂小测 4~5 道题，只用 single / multi / fill，总分 100（5 题每题 20 分，4 题每题 25 分）。
- 每题都要有解析 explanation，说明为什么对、常见错误是什么。
- 正确选项的位置要打散，不要总是 A；干扰项要像真的（常见误区），不要一眼能排除。
- 题目和课文用词、数据一致；计算题数字要算对，写入前自己再算一遍。
- 每题 id 在本模块内唯一（q1、q2 …）。
- 修改已有习题时保留原有题目的 id，这样学生已交的作答能按新答案重新判分。`,
  },
  {
    slug: "html-animation",
    name: "HTML动画制作",
    description: "做 HTML 互动动画、小游戏、计算实训时必读：画风、结构、评分上报、平台限制、写作流程和模板",
    content: `# HTML 互动动画制作规范

## 画风（老师的要求，所有作品都要遵守）
- 精细建模、清晰的描边线、细致但简洁的材质层次（亮面/暗面两层配色，小部件叠加出细节）。
- 环境里加基础的氛围动效（云、水波、车流、飞鸟、灯光闪烁等）增加生气；帧率低时自动降级（减少或停止氛围动效）。
- 2D 作品用「描边 + 分层配色」的扁平插画风，不要纯色块示意图。
- 界面简体中文；1280×720 下完整可用，窄屏（手机）不破版。

## 结构
1. 讲解动画：分步播放，每步有字幕文字，可暂停、上一步、下一步。
2. 配套交互小问（课时/大纲要求的）+ 额外 1~2 道题（拓展、计算或情境判断）。
3. 有实训/仿真要求的再加实训部分（参数可随机生成，每次不同）。
动画内容、用词、数据要和课时正文一致：先用 get_lesson 读课文。

## 与平台通信（必须）
- 成绩：parent.postMessage({ type: "tp:score", score, max: 100 }, "*")，满分 100。可以多次上报，平台保留最高分；界面上写清楚「平台保留最高分」。
- 全部环节完成后：parent.postMessage({ type: "tp:complete" }, "*")。
- 发布时 html_publish 设置 scored=true、max_score=100。

## 平台限制
- 页面运行在沙箱 iframe 里：不能用 localStorage、sessionStorage、cookie、indexedDB（会直接报错），不能弹窗登录，不能请求平台接口。
- 不能引用外部网站资源（CDN、网络图片、网络字体）：学生网络可能打不开。图片用 SVG / Canvas 画，或内嵌 data URL。
- 3D 用平台内置 three.js（见「3D场景」技能），不要自己打包 three.js。
- 单个 HTML 文件，一般 30~150KB。推荐 iframe 高度 680~720。

## 写作流程（草稿区工具）
1. html_write 创建文件（名字用中文或英文，例如 装车流程.html），第一次写入框架和样式（不超过约 400 行）。
2. 之后用 html_append 分段追加，每段不超过约 400 行；改已有内容用 html_edit（old_text 要从文件里原样复制，并且足够长、在文件中唯一）。
3. 写完用 html_check 检查：它会做语法检查，并在老师的浏览器里实际运行，报告脚本错误。有问题就用 html_view / html_search 定位，html_edit 修复，再检查，直到没有错误。
4. html_publish 发布到课时（新建 HTML 模块或替换已有模块）。
5. 修改已有动画：先 html_open 把课时里的动画拷到草稿区，再按上面步骤改。

## 模板（2D，Canvas 绘制）
下面是一个能直接运行的完整示例，包含：分步讲解（字幕、暂停/上一步/下一步）、描边分层画风工具、氛围动效与降级、小题判分、成绩上报。按主题替换场景和题目，保留结构。

\`\`\`html
${template2d}
\`\`\``,
  },
  {
    slug: "three-3d",
    name: "3D场景",
    description: "用 three.js 做 3D 动画/仿真时必读：平台内置 three.js 的引用方式、描边画风、性能降级、3D 模板",
    content: `# 3D 场景（three.js）

## 引用方式（平台内置，不要用 CDN，不要自己打包）
在 <head> 里放 importmap，然后用 module 脚本：
\`\`\`html
<script type="importmap">{"imports":{"three":"/lib/three/three.module.js","three/addons":"/lib/three/addons.js"}}</script>
<script type="module">
import * as THREE from "three";
import { OrbitControls, RoundedBoxGeometry, mergeGeometries, CSS2DRenderer, CSS2DObject } from "three/addons";
</script>
\`\`\`
three/addons 里可用：OrbitControls、MapControls、DragControls、RoundedBoxGeometry、ConvexGeometry、mergeGeometries、mergeVertices、CSS2DRenderer、CSS2DObject、RoomEnvironment、Line2、LineGeometry、LineMaterial、LineSegments2、LineSegmentsGeometry、Sky、SimplexNoise。没有列出的扩展不可用（没有 GLTFLoader 模型文件，所有物体用几何体搭建）。

## 画风
- 每个部件加描边：mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), 深色线材质))。
- 材质层次：主体 + 深浅两色的小部件（车窗、灯、条纹、螺栓、护栏）叠加；MeshStandardMaterial，roughness 0.6~0.8；同色材质复用。
- 模型要精细：车辆有车头、车厢、车窗、车轮、保险杠等；场景有地面分区、标线、围栏、灯杆等细节。用 RoundedBoxGeometry 让边角圆润。
- 氛围动效：云飘动、水面起伏、远处车辆移动、指示灯闪烁。
- 标注用 CSS2DObject（白底深色描边的小标签）。

## 性能（学校电脑和手机配置不高）
- setPixelRatio(Math.min(1.5, devicePixelRatio))；阴影贴图 1024；物体数量多时用 mergeGeometries 合并静态网格。
- 帧率持续偏低时自动降级：关阴影、pixelRatio 降到 1、隐藏氛围动效。
- 用 renderer.setAnimationLoop；窗口大小变化用 ResizeObserver 适配。

## 模板（3D）
\`\`\`html
${template3d}
\`\`\``,
  },
  {
    slug: "course-build",
    name: "从零建课",
    description: "老师要新建整门课程、按大纲批量生成课时时使用：先出方案等确认，再逐个生成",
    content: `# 从零建设一门课程

## 第一步：弄清需求（不要直接开始建）
读老师给的大纲附件或描述，弄清：课程名称、面向的学生、模块和任务（课时）划分、每课时要不要动画、放进哪门课程（新建还是现有课程）。有缺的信息，列出你的默认做法让老师确认，不要一条条追问。

## 第二步：给出方案，等老师确认
在回复里列出：
- 课程名称和简介；
- 模块列表，每个模块下的课时标题（带编号，例如 1-1、1-2）；
- 哪些课时做 HTML 动画，每个动画一句话说明做什么、是 2D 还是 3D；
- 预计的生成顺序。
然后明确问老师「确认后我就开始建」，本轮结束。老师确认之前不要调用任何写入工具。

## 第三步：逐个生成
1. 新建课程（create_course）或使用老师指定的现有课程。
2. 按顺序逐个课时：create_lesson 一次写入全部图文模块和随堂小测（遵守「课时编写」「出题规范」技能），section 填模块名。所有课时都是草稿，学生看不到。
3. 全部课时的文字建完后，再逐个做动画（遵守「HTML动画制作」技能，3D 还要看「3D场景」），html_publish 挂到对应课时的随堂小测之前（index 设为小测模块的位置）。
4. 每完成一个模块，用一两句话汇报进度（完成了哪些课时）。老师中途插话时，先回应老师。

## 最后
汇报：建了哪些课时、哪些有动画、有没有没做完或需要老师检查的地方。提醒老师检查后自己把课时设为「开放」。`,
  },
];

export async function listSkills(teacherId: string): Promise<Skill[]> {
  const rows = await db.query.aiSkills.findMany({
    where: eq(schema.aiSkills.teacherId, teacherId),
    orderBy: asc(schema.aiSkills.name),
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const builtins = BUILTIN_SKILLS.map((b) => {
    const r = bySlug.get(b.slug);
    return r
      ? { slug: b.slug, name: r.name, description: r.description, content: r.content, enabled: r.enabled, builtin: true, modified: true }
      : { ...b, enabled: true, builtin: true, modified: false };
  });
  const custom = rows
    .filter((r) => !BUILTIN_SKILLS.some((b) => b.slug === r.slug))
    .map((r) => ({ slug: r.slug, name: r.name, description: r.description, content: r.content, enabled: r.enabled, builtin: false, modified: false }));
  return [...builtins, ...custom];
}

export async function findSkill(teacherId: string, nameOrSlug: string) {
  const all = (await listSkills(teacherId)).filter((s) => s.enabled);
  const k = nameOrSlug.trim();
  return all.find((s) => s.slug === k || s.name === k) ?? all.find((s) => s.name.includes(k) || k.includes(s.name));
}

export async function saveSkill(
  teacherId: string,
  slug: string | null,
  v: { name: string; description: string; content: string; enabled: boolean },
) {
  const name = v.name.trim().slice(0, 40);
  if (!name) throw new Error("请填写技能名称");
  const key = slug ?? name;
  if (!slug) {
    const exists = (await listSkills(teacherId)).some((s) => s.slug === key || s.name === name);
    if (exists) throw new Error("已经有同名技能");
  }
  const set = { name, description: v.description.trim().slice(0, 200), content: v.content, enabled: v.enabled };
  await db
    .insert(schema.aiSkills)
    .values({ teacherId, slug: key, ...set })
    .onConflictDoUpdate({ target: [schema.aiSkills.teacherId, schema.aiSkills.slug], set });
  return key;
}

// 内置技能：恢复默认；自建技能：删除
export async function deleteSkill(teacherId: string, slug: string) {
  await db.delete(schema.aiSkills).where(and(eq(schema.aiSkills.teacherId, teacherId), eq(schema.aiSkills.slug, slug)));
}
