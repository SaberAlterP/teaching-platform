// 演示老师：往数据库里加几位示例老师（含课程、课时和 AI 用量记录），用来看“管理员 → 用量统计”的效果。
// 所有演示老师的账号都以 demot 开头（如 demot01），密码就是账号名；一条命令即可删干净。
//
// 生成：docker compose exec app node scripts/demo-teachers.mjs [--count 6]
// 删除：docker compose exec app node scripts/demo-teachers.mjs --clean
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PREFIX = "demot";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params);

if (args.includes("--clean")) {
  // courses.teacher_id 没有级联删除，先删课程（班级、课时、学生选课随之删除），再删老师（AI 用量、对话随之删除）
  await q("delete from courses where teacher_id in (select id from users where role='TEACHER' and username like $1)", [`${PREFIX}%`]);
  const { rowCount } = await q("delete from users where role='TEACHER' and username like $1", [`${PREFIX}%`]);
  console.log(`✓ 已删除 ${rowCount} 位演示老师（连同他们的课程和 AI 用量记录）`);
  await pool.end();
  process.exit(0);
}

const COUNT = Math.max(1, Math.min(20, parseInt(arg("count", "6"), 10) || 6));
const id = () => randomBytes(12).toString("base64url");
const rnd = Math.random;
const between = (a, b) => a + rnd() * (b - a);
const DAY = 24 * 3600 * 1000;

const { rows: [{ n: existing }] } = await q("select count(*)::int n from users where username like $1", [`${PREFIX}%`]);
if (existing) {
  console.log(`已经有 ${existing} 个演示账号。请先执行 --clean 删除，再重新生成。`);
  await pool.end();
  process.exit(1);
}

const NAMES = ["陈晓明", "李思远", "王雅琪", "张志强", "刘佳宁", "赵文博", "周婷婷", "吴浩然", "郑欣怡", "孙振华", "马俊杰", "朱梦瑶", "胡建国", "林诗涵", "何晓峰", "高雪梅", "罗成", "梁静", "谢天宇", "宋佳怡"];
const COURSES = ["仓储与配送管理", "供应链管理基础", "国际货运代理实务", "物流信息技术", "采购与库存管理", "电商物流实务", "冷链物流管理", "物流成本管理"];
const LESSONS = ["课程导入", "基础概念", "典型流程", "案例分析", "岗位实操", "综合实训"];
const SECTIONS = ["模块一 认识课程", "模块二 核心任务"];

const client = await pool.connect();
let nCalls = 0;
try {
  await client.query("begin");
  for (let i = 0; i < COUNT; i++) {
    const uname = `${PREFIX}${String(i + 1).padStart(2, "0")}`;
    const uid = id();
    await client.query(
      "insert into users (id, username, name, password_hash, role, must_change_password, created_at, last_login_at) values ($1,$2,$3,$4,'TEACHER',false,$5,$6)",
      [uid, uname, NAMES[i % NAMES.length], await bcrypt.hash(uname, 10), new Date(Date.now() - between(20, 90) * DAY), rnd() < 0.85 ? new Date(Date.now() - rnd() * 7 * DAY) : null],
    );
    const cid = id();
    await client.query("insert into courses (id, title, description, teacher_id) values ($1,$2,$3,$4)", [cid, COURSES[i % COURSES.length], "（演示数据）", uid]);
    await client.query("insert into classes (id, name, course_id) values ($1,$2,$3)", [id(), `物流 24${String(i + 1).padStart(2, "0")} 班`, cid]);
    const nLessons = 3 + Math.floor(rnd() * 4);
    for (let l = 0; l < nLessons; l++) {
      await client.query(
        `insert into lessons (id, course_id, title, summary, section, "order", status) values ($1,$2,$3,'',$4,$5,$6)`,
        [id(), cid, LESSONS[l % LESSONS.length], SECTIONS[l < 3 ? 0 : 1], l, rnd() < 0.5 ? "OPEN" : "DRAFT"],
      );
    }

    // AI 用量：有的老师用得多，有的几乎不用；分散在最近 30 天，工作日更多
    const heavy = [0.1, 0.4, 0.8, 1.2, 2][i % 5];
    for (let d = 0; d < 30; d++) {
      const at = new Date(Date.now() - d * DAY);
      const weekday = at.getDay() % 6 !== 0;
      if (rnd() > (weekday ? 0.55 : 0.15) * Math.min(1, heavy + 0.2)) continue;
      const calls = 1 + Math.floor(rnd() * 12 * heavy + 1);
      for (let c = 0; c < calls; c++) {
        const prompt = Math.round(between(4000, 60000) * (0.5 + heavy / 2));
        await client.query(
          "insert into ai_usage_log (id, teacher_id, chat_id, model, prompt_tokens, completion_tokens, cached_tokens, created_at) values ($1,$2,null,'deepseek-flash',$3,$4,$5,$6)",
          [id(), uid, prompt, Math.round(between(300, 6000) * (0.5 + heavy / 2)), Math.round(prompt * between(0.3, 0.85)), new Date(at.getTime() - rnd() * DAY * 0.8)],
        );
        nCalls++;
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
console.log(`✓ 已加入 ${COUNT} 位演示老师（${PREFIX}01 起，密码就是账号名），共 ${nCalls} 条 AI 用量记录`);
console.log(`  删除请执行：node scripts/demo-teachers.mjs --clean`);
