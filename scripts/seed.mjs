// 初始化：创建教师账号 + 运输课示范内容 + 演示学生（可选）
// 用法：node scripts/seed.mjs            只建教师账号和示范课
//      node scripts/seed.mjs --demo     另外创建 30 个演示学生和模拟作答，方便看统计效果
// 环境变量：TEACHER_USERNAME（默认 teacher）、TEACHER_PASSWORD（默认 teacher123，首次登录会要求修改）
import pg from "pg";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

const id = () => randomBytes(12).toString("base64url");
const DEMO = process.argv.includes("--demo");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const username = process.env.TEACHER_USERNAME ?? "teacher";
const password = process.env.TEACHER_PASSWORD ?? "teacher123";

let { rows: [teacher] } = await q("select * from users where username=$1", [username]);
if (teacher) {
  console.log(`教师账号 ${username} 已存在，跳过初始化。`);
  await pool.end();
  process.exit(0);
}
teacher = { id: id() };
await q("insert into users (id, username, name, password_hash, role, must_change_password) values ($1,$2,$3,$4,'TEACHER',true)", [
  teacher.id, username, "任课教师", await bcrypt.hash(password, 10),
]);
const courseId = id();
await q("insert into courses (id, title, description, teacher_id) values ($1,$2,$3,$4)", [
  courseId, "运输管理实务", "从运输方式、成本与时效出发，理解物流运输决策", teacher.id,
]);
const classId = id();
await q("insert into classes (id, name, course_id) values ($1,$2,$3)", [classId, "物流 2401 班", courseId]);

// ---- 把示范 HTML 包放进上传目录 ----
async function addPackage(file) {
  const src = path.join(root, "..", "demo-content", "dist", file);
  if (!fs.existsSync(src)) { console.warn("未找到示范文件（先运行 npm run demo:build）：", file); return ""; }
  const aid = id();
  fs.mkdirSync(path.join(UPLOAD_DIR, aid), { recursive: true });
  fs.copyFileSync(src, path.join(UPLOAD_DIR, aid, "index.html"));
  await q("insert into assets (id, kind, filename, mime, size, entry) values ($1,'package',$2,'text/html',$3,'index.html')", [
    aid, file, fs.statSync(src).size,
  ]);
  return aid;
}
const anim = await addPackage("五种运输方式-3D.html");
const game = await addPackage("物流调度小游戏.html");

// ---- 示范课 ----
const L1 = id();
await q("insert into lessons (id, course_id, title, summary, \"order\", status) values ($1,$2,$3,$4,0,'OPEN')", [
  L1, courseId, "第一讲 运输方式的选择", "五种基本运输方式的特点，以及如何在成本与时效之间做权衡",
]);
const quiz1 = {
  allowRetry: true, showAnswers: true,
  questions: [
    { id: "q1", type: "single", prompt: "下列货物中，最适合采用**航空运输**的是：", options: ["2000 吨铁矿石", "一批急需的疫苗", "5000 吨散装粮食", "原油"], answer: 1, points: 2, explanation: "航空运输速度最快但成本最高，适合高价值、时效要求高的货物。" },
    { id: "q2", type: "single", prompt: "五种运输方式中，**单位运输成本最低**的通常是：", options: ["公路", "铁路", "水路", "航空"], answer: 2, points: 2, explanation: "大型船舶运量极大，摊到每吨公里的成本最低。" },
    { id: "q3", type: "multi", prompt: "关于**公路运输**，下列说法正确的有（多选）：", options: ["可以实现门到门服务", "适合长距离大宗货物", "机动灵活", "单次运量最大"], answer: [0, 2], points: 3, explanation: "公路运输灵活、可门到门，但单车运量小，长途大宗不经济。" },
    { id: "q4", type: "fill", prompt: "集装箱运输中常用的计量单位\"标准箱\"的英文缩写是 ____。", answer: ["TEU"], points: 2, explanation: "TEU：Twenty-foot Equivalent Unit，20 英尺标准箱。" },
    { id: "q5", type: "short", prompt: "某企业要把 3000 吨煤从山西运到天津港，请选择运输方式并简要说明理由。", answer: "铁路。大宗、中长途、对时效要求不高，铁路运量大、成本低、受天气影响小；且两地均有铁路（大秦线）。", points: 5 },
  ],
};
const mods = [
  ["RICHTEXT", "导入：一个快递的旅程", { markdown: `你在网上下单的一件商品，可能先坐**卡车**离开工厂，再搭上**火车**或**货轮**跨越上千公里，最后又由**快递车**送到你家门口。\n\n这节课我们要回答三个问题：\n\n1. 有哪几种基本的运输方式？\n2. 它们在**速度、成本、运量**上有什么区别？\n3. 面对一张具体的订单，该怎么选？\n\n> 💡 学习方式：先看下面的 3D 演示（在演示区域内滚动鼠标滚轮），再做练习，最后用小游戏检验自己。` }],
  ["HTML", "互动演示：五种运输方式", { assetId: anim, height: 620, scored: false, note: "把鼠标放在画面上滚动滚轮，镜头会依次经过五种运输方式。" }],
  ["RICHTEXT", "知识整理：如何选择运输方式", { markdown: `## 比较维度\n\n| 方式 | 速度 | 单位成本 | 运量 | 灵活性 | 典型货物 |\n| --- | --- | --- | --- | --- | --- |\n| 公路 | 快（短途） | 较高 | 小 | ★★★★ | 快递、日用品 |\n| 铁路 | 较快 | 低 | 大 | ★★ | 煤炭、粮食、集装箱 |\n| 水路 | 慢 | 最低 | 最大 | ★ | 矿石、集装箱、整车 |\n| 航空 | 最快 | 最高 | 小 | ★★ | 电子产品、药品、生鲜 |\n| 管道 | 连续 | 低 | 大 | ☆ | 石油、天然气 |\n\n## 决策思路\n\n1. **先看约束**：两端有没有港口、机场、铁路？货物重量是否超出限制？\n2. **再看时限**：算出每种方式的在途时间（含装卸、中转），排除会超时的方式。\n3. **最后比成本**：在满足时限的方式里，选总成本最低的。\n\n> ⚠️ 易腐品、紧急物资一旦超时，损失往往远超运费差价。` }],
  ["QUIZ", "课堂练习", quiz1],
  ["HTML", "实训：物流调度中心", { assetId: game, height: 640, scored: true, maxScore: 100, note: "完成三天的调度后，成绩会自动记录。可以多玩几次，记录最高分。" }],
  ["RICHTEXT", "课后思考", { markdown: `- 生活中你见过哪些**多式联运**的例子？（比如"海铁联运"）\n- 如果油价上涨 30%，哪种运输方式受影响最大？为什么？\n\n下一讲我们将学习**运输成本的构成与计算**。` }],
];
for (const [i, [type, title, data]] of mods.entries()) {
  await q("insert into modules (id, lesson_id, \"order\", type, title, data) values ($1,$2,$3,$4,$5,$6)", [id(), L1, i, type, title, data]);
}
const L2 = id();
await q("insert into lessons (id, course_id, title, summary, \"order\", status) values ($1,$2,$3,$4,1,'DRAFT')", [
  L2, courseId, "第二讲 运输成本的构成", "（草稿，尚未开放）固定成本、变动成本与运价",
]);
await q("insert into modules (id, lesson_id, \"order\", type, title, data) values ($1,$2,0,'RICHTEXT','',$3)", [
  id(), L2, { markdown: "## 本讲内容准备中\n\n- 固定成本与变动成本\n- 运价的构成\n- 案例：一票货的完整报价" },
]);

console.log(`✓ 教师账号：${username} / ${password}（首次登录需修改密码）`);
console.log("✓ 已创建示范课程《运输管理实务》");

// ---- 演示学生与模拟作答 ----
if (DEMO) {
  const surnames = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高".split("");
  const given = ["子涵", "浩然", "欣怡", "宇轩", "梓萱", "俊杰", "雨桐", "博文", "思远", "佳琪", "明轩", "诗涵", "志强", "晓彤", "嘉怡"];
  const pw = await bcrypt.hash("123456", 10);
  const { rows: ms } = await q("select id, type, data from modules where lesson_id=$1 order by \"order\"", [L1]);
  let seedN = 42;
  const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  for (let i = 1; i <= 30; i++) {
    const uid = id();
    const uname = `2401${String(i).padStart(2, "0")}`;
    const name = surnames[Math.floor(rnd() * surnames.length)] + given[Math.floor(rnd() * given.length)];
    await q("insert into users (id, username, name, password_hash, role, must_change_password) values ($1,$2,$3,$4,'STUDENT',false)", [uid, uname, name, pw]);
    await q("insert into enrollments (user_id, class_id) values ($1,$2)", [uid, classId]);
    const skill = 0.35 + rnd() * 0.6;
    const reach = rnd() < 0.85 ? ms.length : Math.floor(rnd() * ms.length);
    for (const m of ms.slice(0, reach)) {
      await q("insert into module_progress (user_id, module_id) values ($1,$2)", [uid, m.id]);
      if (m.type === "QUIZ") {
        const answers = {}, items = {};
        let score = 0, max = 0, needs = false;
        for (const qq of m.data.questions) {
          max += qq.points;
          const right = rnd() < skill + (qq.id === "q3" ? -0.25 : 0);
          if (qq.type === "single") answers[qq.id] = right ? qq.answer : (qq.answer + 1) % qq.options.length;
          if (qq.type === "multi") answers[qq.id] = right ? qq.answer : [0];
          if (qq.type === "fill") answers[qq.id] = right ? "TEU" : "FEU";
          if (qq.type === "short") {
            answers[qq.id] = right ? "选铁路，运量大、成本低，适合大宗货物中长途运输。" : "公路，因为比较灵活。";
            if (rnd() < 0.4) { items[qq.id] = null; needs = true; continue; }
            items[qq.id] = right ? 4 : 2; score += items[qq.id]; continue;
          }
          items[qq.id] = right ? qq.points : 0;
          score += items[qq.id];
        }
        await q("insert into submissions (id, user_id, module_id, answers, item_scores, score, max_score, needs_grading) values ($1,$2,$3,$4,$5,$6,$7,$8)", [
          id(), uid, m.id, answers, items, score, max, needs,
        ]);
      }
      if (m.type === "HTML" && m.data.scored) {
        const s = Math.round(Math.min(100, 30 + skill * 70 + rnd() * 10));
        await q("insert into submissions (id, user_id, module_id, answers, score, max_score, attempts) values ($1,$2,$3,$4,$5,100,$6)", [
          id(), uid, m.id, { last: s }, s, 1 + Math.floor(rnd() * 3),
        ]);
      }
    }
  }
  console.log("✓ 已创建 30 个演示学生（学号 240101–240130，密码 123456）及模拟作答");
}
await pool.end();
