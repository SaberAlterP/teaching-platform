import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import template2d from "./template-2d.html";
import template3d from "./template-3d.html";
import template3dAir from "./template-3d-air.html";

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
- 3D 用平台内置 three.js 和 tp3d 部件库（见「3D场景」技能），不要自己打包 three.js，不要从零建模常用车辆设备。
- 单个 HTML 文件，一般 30~150KB。推荐 iframe 高度 680~720。

## 写作流程（草稿区工具）
1. html_write 创建文件（名字用中文或英文，例如 装车流程.html），第一次写入框架和样式（不超过约 400 行）。
2. 之后用 html_append 分段追加，每段不超过约 400 行；改已有内容用 html_edit（old_text 要从文件里原样复制，并且足够长、在文件中唯一）。
3. 写完用 html_check 检查：它会做语法检查，并在老师的浏览器里实际运行，报告脚本错误。有问题就用 html_view / html_search 定位，html_edit 修复，再检查，直到没有错误。
4. html_publish 发布到课时（新建 HTML 模块或替换已有模块）。
5. 修改已有动画：先 html_open 把课时里的动画拷到草稿区，再按上面步骤改。

3D 作品按「3D场景」技能的三阶段流程做（场景清单 → 搭场景 → 剧情和题目），用 tp3d 时不用自己写界面、评分和上报。

## 模板（2D，Canvas 绘制）
下面是一个能直接运行的完整示例，包含：分步讲解（字幕、暂停/上一步/下一步）、描边分层画风工具、氛围动效与降级、小题判分、成绩上报。按主题替换场景和题目，保留结构。

\`\`\`html
${template2d}
\`\`\``,
  },
  {
    slug: "three-3d",
    name: "3D场景",
    description: "做 3D 动画/仿真时必读：平台 tp3d 部件库（车辆、飞机、集装器、货架、人物、厂房、讲解播放器、小题评分）的用法、三阶段制作流程、自查清单和完整范例",
    content: `# 3D 场景（three.js + 平台 tp3d 部件库）

平台内置了 **tp3d 部件库**：里面是从老师认可的精品 3D 作品里提取的精细部件（描边、分层配色、可动部件），以及现成的场景外壳、分步讲解播放器、小题和成绩上报。
**3D 作品一律用 tp3d 搭建**，不要自己从零建模车辆、飞机、人、货架这些常用物体；你的精力放在「场景布置 + 剧情 + 题目」上。部件库没有的物体，再用 T.Kit 自己搭（见下文）。

## 引用方式（固定写法，不要用 CDN）
\`\`\`html
<script type="importmap">{"imports":{"three":"/lib/three/three.module.js","three/addons":"/lib/three/addons.js","tp3d":"/lib/tp3d/tp3d.js"}}</script>
<script type="module">
import * as THREE from "three";
import * as T from "tp3d";
const app = T.createApp({ title: "标题", ground: "concrete", size: 150, camera: { pos: [30, 20, 40], target: [0, 1, 0] } });
</script>
\`\`\`
页面 <body> 里不用写任何 HTML 和 CSS：标题栏、得分、字幕、按钮、右侧题目面板都由 createApp 生成。

## 坐标约定
- 单位米，y 向上。每个部件返回 THREE.Group，**原点在地面中心，车辆车头朝 +x**。
- app.add(obj, x, y, z, ry) 放进场景；ry 是绕 y 轴旋转（弧度）：ry = -Math.PI / 2 车头朝 +z，Math.PI / 2 朝 -z，Math.PI 朝 -x。
- 厂房 warehouse 正面（装卸门）朝 +z；货架、驿站货架正面朝 +z。

## createApp 选项
title；sky: "day" | "dusk" | "indoor"（室内不画云和远处草地）；ground: "concrete" 场站 | "apron" 机坪 | "asphalt" 沥青 | "floor" 库内地坪 | "grass" | false；size 地面边长（米）；camera { pos, target }；shadowSize 阴影范围（场景大时调大）；ambient: true 自动加云和飞鸟。

## 部件（T.xxx(选项)，选项都可以省略）
| 部件 | 说明 | 常用选项 | userData（可动部分） |
|---|---|---|---|
| truck | 厢式货车/冷藏车，长 12 m，厢底高 1.25 m | text, sub, brand:"#1f5f9e", cab, reefer:true, plate:"沪A·12345" | setDoors(0~1) 开后门；seal 施封锁（visible）；side 一侧厢壁（visible=false 看车厢内部）；setLights(true)；rearX / frontX 车尾和前墙的 x |
| semi | 牵引车+半挂车，长 17 m | text, cab, plate | setDoors、setLegs(1 放下支腿)、seal、tractor、trailer（甩挂时分开移动）|
| tractor | 单独的牵引车 | cab, label | beacon |
| van | 快递面包车，长 5 m | color, brand, text | setDoor(0~1) 侧滑门 |
| ulv | 无人配送车（两侧快递柜门，激光雷达自动转） | text, code | lidar, led |
| forklift | 平衡重叉车 | color | setLift(高度)；fork 货叉组（托盘 add 到 fork 上，放在 (1.65, 0.05, 0)） |
| aircraft | 宽体全货机，长 64 m，机头 +x，主货舱门在左舷 -z、门中心 x≈-8、地板高 4.9 m | label, tail:颜色, pax:true 客机, lite:true 远景 | setDoor(0~1)；fanSpeed；doorPos |
| uld | 航空集装器 | type:"AKE" \| "PMC" \| "PMC-loaded", code, height | type, height |
| tug / dolly | 机坪牵引车 / 集装器拖斗（台面高 0.62 m） | dolly({ load:"AKE", code }) | dolly.userData.load（拖斗上的集装器）|
| loader | 主货舱升降平台车，平台沿 z | — | setH(0.9~5) 升降；plat 平台组（货 add 到 plat 上）|
| beltLoader | 下货舱传送带车 | — | setAngle(弧度) |
| pallet / palletLoad | 木托盘 1.2×1.0 m / 托盘货（纸箱+缠绕膜）| palletLoad({ layers: 3 }) | height |
| carton / parcel | 纸箱（胶带+面单）/ 快递小件 | carton({ w, h, d, code, label:"易碎" })；parcel({ kind:"box" \| "bag" }) | h（叠放用）|
| rack | 横梁式托盘货架，每列 2.7 m 宽放 2 托，层高 1.6 m，带货位号 A-01-02 | bays, levels, fill:0~1, code:"A" | slot(列, 层, 第几托) 返回货位坐标 |
| shelf | 轻型层板货架（驿站/拣货），每格带格口号 A-1-1 | cols, levels, fill, code | cell(列, 层) |
| conveyor | 皮带输送机，沿 x，皮带自动滚动 | length, width, height, speed, rollers:true 滚筒 | at(u) 返回皮带面上 u(0~1) 处坐标 |
| cageCart | 笼车 | bags | — |
| container | 海运集装箱 20/40 尺，箱门在 -x 端 | size, color, text | length |
| person | 作业人员（会走路、抬手）| vest:背心色, hat:安全帽色 | walk(相位)；pose(左臂, 右臂)（-1.4 = 向前平举）|
| warehouse | 仓库/分拨中心/货站厂房，正面朝 +z，带装卸门和 1.2 m 高月台 | w, d, h, doors, firstNo:第一个门号, open:[开着的门序号], sign, sub, dock:false 无月台, band:色带颜色 | cutaway(true) 去掉屋顶和正面墙看库内；doorX 各门 x；dockH 月台高（库内地面高度）|
| office | 办公楼/门岗/调度室 | w, d, floors, sign | — |
| tower | 机场塔台（远景）| h | — |
| road | 道路，沿 x | length, width, lanes, sidewalk | — |
| zone | **地面功能分区**（彩色边框+名称） | w, d, name, color:"#16a34a", dashed, fill | — |
| markLine | 地面标线（折线）| markLine([[x,z],…], { color, width, dashed }) | — |
| arrow | 地面方向箭头，指向 +x | size, color | — |
| tree / lamp / cone / fence / sign | 树（随风摆）/ 高杆灯 / 锥桶 / 围栏 / 标牌 | tree({ s })；lamp({ h })；fence({ length })；sign("文字", "副标题", { w, h, bg, post:立柱高 }) | — |

部件放在别的部件上：直接 parent.add(child)（例如 truck.add(palletLoad)、dolly.add(uld)、loader.userData.plat.add(uld)），child 的坐标就是相对 parent 的。

## app 的方法
- app.add(obj, x, y, z, ry)：放进场景。部件自带的动效（风扇、皮带、警示灯、树摆动）自动运行。
- app.label("文字", 物体或 [x,y,z], { kind: "tag" | "big" | "warn" | "ok" | "num", dy, keep })：3D 标注。讲解步骤 enter() 里建的标签换步时自动删除；keep: true 一直保留。返回 { remove(), show(bool), set(文字) }。
- app.steps([...])：分步讲解（字幕、暂停/上一步/下一步、目录、进度条、相机自动飞到 cam）。每步：
  { title, text（可带 <b>）, dur 秒数, cam: { pos, target }, enter() 一次性准备（建标签等）, update(p, dt) 按进度 p（0~1）设置物体状态, ask: { q, options, answer, explain } 本步结束时弹出的随堂小问 }
  **update(p) 里要算出“绝对状态”**（例如 truck.position.z = lerp(30, 9, seg(p, 0, 0.8))），不要用 += 累加，否则上一步/下一步跳转会乱。平台跳到第 i 步时会自动对前面的步骤调用 update(1)、对后面的步骤调用 update(0)。
- app.quiz([{ q, options: [...], answer: 下标 或 [下标…]（多选）, explain }], { weight: 60 })：右侧「小题」页。选项会自动打乱。
- app.task("实训名称", 权重) → t.done(0~100)：实训评分。app.panel("实训", { onShow }) 返回右侧面板的容器，往里写说明和按钮。
- 成绩：所有小问 + 小题合成「小题」分，和各实训按权重折算成 100 分，**自动上报 tp:score（平台保留最高分）**，全部做完自动发 tp:complete。不要自己再写 postMessage。
- app.pick([物体…], (obj) => {...})：在 3D 画面里点选物体（鼠标变手形），做“点出正确的设备/货位”类实训很合适。app.highlight(obj, 颜色) 高亮框，返回 { remove() }。
- app.flyTo([相机位置], [看向的点], 秒)；app.onTick((dt, t) => {...}) 每帧调用；app.toast("提示", "ok" | "bad")；await app.modal({ title, html, buttons: [{ text, value, primary }] })。
- app.moveAlong(obj, [[x,z],…], { speed, loop })：按时间沿路线移动（适合背景循环）。app.ambient({ traffic: [{ obj: T.van(), points, speed }], people: [{ obj: T.person(), points }] })：背景循环车流和走动的人（低帧率时自动隐藏）。
- 帧率低时 tp3d 自动降级（关阴影、降分辨率、隐藏氛围物体），不用自己写。

## 动画小工具
T.lerp(a, b, t)；T.seg(p, a, b)（p 在 a~b 之间时从 0 平滑走到 1，用来把一步拆成几个小动作）；T.ease(x)；T.clamp(v, a, b)；T.V(x, y, z) 新建 Vector3；T.mix([x,y,z], [x,y,z], t)；
T.path([[x,z],…], { y, smooth }) → .place(obj, u) 把物体放到路线 u(0~1) 处并朝向前进方向（人物自动迈腿），.at(u) 返回点；倒车时 place(obj, u, false) 不改朝向。

## 自己搭部件库里没有的物体
const k = new T.Kit(); k.box(宽, 高, 深, 颜色, x, 底面y, z, ry); k.cyl(半径, 高, 颜色, x, y, z)；k.hcyl(半径, 长, 颜色, x, y, z, 沿z)；k.bar(x1,y1,z1, x2,y2,z2, 粗细, 颜色)；k.wheel(半径, 宽, x, y, z)；
const g = new THREE.Group(); k.build(g); app.add(g, …)。一个物体用一个 Kit：很多小零件（亮面主体 + 暗面细节，用 T.shade(颜色, 0.7) 取暗色）合并成一个带描边的网格。T.kit((k) => {...}) 是简写，直接返回 Group。
文字牌：T.sign("出港区", "OUTBOUND", { w: 6, h: 1.4 })；自画贴图：T.textPlane(宽, 高, (ctx, w, h) => {...})。

## 画风与精细度（老师的要求）
- 场景要“满”：一个作业场景一般有 1 座厂房或飞机 + 3~6 种车辆设备 + 货物 + 3 个以上人物 + 4 个以上地面分区/标线 + 树、灯杆、锥桶、围栏等小品 + 远景（道路车流、办公楼、塔台）。
- 每个作业区用 T.zone 标出名称，通道用 markLine，行车方向用 arrow。
- 关键设备和区域加 app.label；讲到哪个对象就在那一步标出来、相机飞过去。
- 氛围：云和鸟自动有；再加 app.ambient 的循环车辆和走动的人。

## 三阶段制作流程（必须按顺序，每阶段结束都 html_check）
1. **场景清单**：先读课时正文，在文件开头的注释里列出「区域 / 设备 / 人物 / 氛围」清单（照着范例写）。清单要对应课文里的岗位和设备。
2. **搭场景**：html_write 写 importmap、createApp 和全部场景物体（不写步骤和题目）。html_check：看「问题」里有没有“画面太空”，看「自查清单」，缺什么补什么，直到场景这几项都是 ✓。
3. **剧情和题目**：html_append 追加 app.steps（3~8 步，每步有相机位置、字幕、动画和标注，至少 2 步带 ask 小问）、app.quiz（1~2 道拓展/计算/情境题），有实训要求再加 app.task + app.panel + app.pick。html_check 直到没有问题、清单全是 ✓，再 html_publish。

## 常见错误
- importmap 少了 tp3d 一项 → 页面打不开。
- 物体位置互相穿插：放之前先算好坐标（车长 12 m 的车，中心离月台边至少 6 m）；厂房正面墙在 z = 中心z + d/2。
- 在 update 里新建物体或标签（每帧都会建一个）→ 放到 enter 里建。
- 忘了 await 不能用在顶层以外；模块脚本里的变量不在 window 上。

## 范例一：分拨中心出港装车（公路/仓储类）
航空类场景另有范例，见「3D范例：航空货站」技能。
\`\`\`html
${template3d}
\`\`\``,
  },
  {
    slug: "three-3d-air",
    name: "3D范例：航空货站",
    description: "做机场、航空货运、集装器类 3D 时读：全货机装机的完整范例（先读「3D场景」技能）",
    content: `# 范例二：全货机主舱集装器装机（航空类）

用法和「3D场景」技能一样。注意：飞机长 64 m、翼展 64 m，场景 size 用 200 以上，shadowSize 用 70 左右；
主货舱门在左舷（-z 侧），门中心 x = (T.AC.door.x0 + T.AC.door.x1) / 2，舱门地板高 T.AC.floorY（4.9 m），机身半径 T.AC.R（3.1 m）。
平台车放在 (门中心 x, 0, -T.AC.R - 4.3)，setH(T.AC.floorY) 就和舱门齐平。

\`\`\`html
${template3dAir}
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
