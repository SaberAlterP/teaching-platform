// 演示学生：往当前数据库里加一批随机学生和作答记录，方便看成绩、统计页面的效果。
// 所有演示学生的学号都以 demo 开头（如 demo240101），密码就是学号；一条命令即可删干净。
//
// 生成：docker compose exec app node scripts/demo-students.mjs [--count 40] [--course 课程名]
// 删除：docker compose exec app node scripts/demo-students.mjs --clean
// 环境变量 TEACHER_USERNAME 指定教师账号（默认取 docker compose 里的设置，即 teacher）
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PREFIX = "demo";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params);

// ---- 删除 ----
if (args.includes("--clean")) {
  const { rowCount } = await q("delete from users where role='STUDENT' and username like $1", [`${PREFIX}%`]);
  console.log(`✓ 已删除 ${rowCount} 个演示学生（连同他们的作答和学习记录）`);
  await pool.end();
  process.exit(0);
}

const COUNT = Math.max(2, Math.min(200, parseInt(arg("count", "40"), 10) || 40));
const id = () => randomBytes(12).toString("base64url");
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const DAY = 24 * 3600 * 1000;
const ago = (maxDays) => new Date(Date.now() - rnd() * maxDays * DAY);

const { rows: [{ n: existing }] } = await q("select count(*)::int n from users where username like $1", [`${PREFIX}%`]);
if (existing) {
  console.log(`已经有 ${existing} 个演示学生。请先执行 --clean 删除，再重新生成。`);
  await pool.end();
  process.exit(1);
}

// ---- 找到教师、课程、班级（和页面上默认显示的第一门课一致）----
const tname = process.env.TEACHER_USERNAME ?? "teacher";
let { rows: [teacher] } = await q("select id from users where username=$1 and role='TEACHER'", [tname]);
if (!teacher) ({ rows: [teacher] } = await q("select id from users where role='TEACHER' order by created_at limit 1"));
if (!teacher) throw new Error("没有找到教师账号");
const wantCourse = arg("course", "");
const { rows: courses } = await q("select id, title from courses where teacher_id=$1 order by created_at", [teacher.id]);
const course = (wantCourse && courses.find((c) => c.title === wantCourse)) || courses[0];
if (!course) throw new Error("没有找到课程");
const { rows: [cls] } = await q("select id, name from classes where course_id=$1 order by created_at limit 1", [course.id]);

// ---- 课程里的课时与模块 ----
const { rows: lessons } = await q('select id from lessons where course_id=$1 order by "order", created_at', [course.id]);
const { rows: mods } = await q(
  `select m.id, m.lesson_id, m.type, m.data from modules m join lessons l on l.id=m.lesson_id
   where l.course_id=$1 order by m."order"`, [course.id]);
const byLesson = new Map(lessons.map((l) => [l.id, []]));
for (const m of mods) byLesson.get(m.lesson_id).push(m);

// ---- 随机姓名 ----
const surnames = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高梁郑谢宋唐韩冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文".split("");
const given1 = "子浩宇梓俊雨博思佳明诗志晓嘉欣天若一梦语心可依安嘉文子紫可芷雅子亦景锦星欣芯晨睿泽轩诚欢昊哲奕彦如少嘉舒佳俊皓宸彬煜书乐".split("");
const given2 = "涵然怡轩萱杰桐文远琪轩涵强彤怡航辰瑶阳宁菲琳雪妍豪磊鑫凯岚洋帆蕾君伟薇睿泽楠宇成博坤颖婷蓉恒毅".split("");
const makeName = () => pick(surnames) + pick(given1) + (rnd() < 0.8 ? pick(given2) : "");

// ---- 作答生成 ----
function quizAnswers(quiz, skill) {
  const answers = {}, items = {};
  let score = 0, max = 0, needs = false;
  for (const qq of quiz.questions ?? []) {
    max += qq.points;
    // 越靠后的题目越难一点
    const right = rnd() < Math.min(0.97, skill - 0.04 * (qq.type === "multi") + between(-0.12, 0.12));
    if (qq.type === "single") {
      answers[qq.id] = right ? qq.answer : (qq.answer + 1 + Math.floor(rnd() * (qq.options.length - 1))) % qq.options.length;
      items[qq.id] = right ? qq.points : 0;
    } else if (qq.type === "multi") {
      const ans = qq.answer;
      answers[qq.id] = right ? ans : ans.length > 1 ? ans.slice(0, -1) : [(ans[0] + 1) % qq.options.length];
      items[qq.id] = right ? qq.points : 0;
    } else if (qq.type === "fill") {
      const accepted = Array.isArray(qq.answer) ? qq.answer : [String(qq.answer ?? "")];
      answers[qq.id] = right ? accepted[0] : pick(["不清楚", "不知道", "无"]);
      items[qq.id] = right ? qq.points : 0;
    } else {
      answers[qq.id] = right
        ? "结合题目条件，比较各方案的时效、成本和风险后，选择综合最优的方案，并说明理由。"
        : "我觉得选择比较灵活的方案就可以了。";
      if (rnd() < 0.12) { items[qq.id] = null; needs = true; continue; } // 少量简答题待批改
      items[qq.id] = Math.round(qq.points * (right ? between(0.7, 1) : between(0.2, 0.5)) * 2) / 2;
    }
    score += items[qq.id];
  }
  return { answers, items, score, max, needs };
}

// ---- 开始写入 ----
const hash = new Map();
const client = await pool.connect();
let nSubs = 0, nProg = 0;
try {
  await client.query("begin");
  for (let i = 0; i < COUNT; i++) {
    const uid = id();
    const cohort = i < COUNT / 2 ? "2401" : "2402"; // 学号里体现两个班级，方便看起来更真实
    const uname = `${PREFIX}${cohort}${String((i % Math.ceil(COUNT / 2)) + 1).padStart(2, "0")}`;
    if (!hash.has(uname)) hash.set(uname, await bcrypt.hash(uname, 10));
    const created = ago(30);
    await client.query(
      "insert into users (id, username, name, password_hash, role, must_change_password, created_at, last_login_at) values ($1,$2,$3,$4,'STUDENT',false,$5,$6)",
      [uid, uname, makeName(), hash.get(uname), created, rnd() < 0.9 ? ago(7) : null],
    );
    await client.query("insert into enrollments (user_id, class_id) values ($1,$2)", [uid, cls.id]);

    const skill = between(0.35, 0.95); // 学习能力
    const diligence = rnd() < 0.15 ? between(0.05, 0.4) : between(0.5, 1); // 少数同学进度落后
    const reach = Math.round(lessons.length * diligence); // 学到第几课
    for (const [li, l] of lessons.entries()) {
      if (li >= reach) break;
      for (const m of byLesson.get(l.id)) {
        if (rnd() < 0.06) continue; // 偶尔漏看某个模块
        const at = ago(14);
        await client.query("insert into module_progress (user_id, module_id, created_at) values ($1,$2,$3)", [uid, m.id, at]);
        nProg++;
        if (m.type === "QUIZ" && Array.isArray(m.data?.questions) && m.data.questions.length) {
          const r = quizAnswers(m.data, skill);
          await client.query(
            `insert into submissions (id, user_id, module_id, answers, item_scores, score, max_score, needs_grading, attempts, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
            [id(), uid, m.id, r.answers, r.items, r.score, r.max, r.needs, rnd() < 0.7 ? 1 : 2 + Math.floor(rnd() * 2), at],
          );
          nSubs++;
        } else if (m.type === "HTML" && m.data?.scored) {
          const max = m.data.maxScore ?? 100;
          const s = Math.round(Math.min(max, max * (0.25 + skill * 0.65 + between(0, 0.1))));
          await client.query(
            `insert into submissions (id, user_id, module_id, answers, score, max_score, attempts, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
            [id(), uid, m.id, { last: s, detail: null }, s, max, 1 + Math.floor(rnd() * 3), at],
          );
          nSubs++;
        }
      }
    }
  }
  await client.query("commit");
} catch (e) {
  await client.query("rollback");
  throw e;
} finally {
  client.release();
  await pool.end();
}
console.log(`✓ 已在《${course.title}》（${cls.name}）加入 ${COUNT} 个演示学生：${nProg} 条学习记录、${nSubs} 条作答`);
console.log(`  学号 ${PREFIX}240101 起，密码就是学号；删除请执行：node scripts/demo-students.mjs --clean`);
