// 创建几门空白占位课程，让教师/学生首页的多课程方块看起来完整；可重复执行，已存在的不会重复创建。
// 用法：node scripts/placeholder-courses.mjs             创建占位课程，并把已有学生加入这些课程的班级
//      node scripts/placeholder-courses.mjs --remove    删除这些占位课程（只删还没有课时的）
// 课程名和简介可以在教师端的“编辑课程信息”里随时修改，改名后脚本会把它当作新课程再建一遍，需要时先用 --remove。
import pg from "pg";
import { randomBytes } from "crypto";

const PLACEHOLDERS = [
  ["仓储与配送管理", "仓库布局、库存控制与配送组织（即将开设）"],
  ["供应链管理基础", "从采购到交付的供应链协同与优化（即将开设）"],
  ["国际货运代理实务", "订舱、报关、单证与国际结算（即将开设）"],
];
const id = () => randomBytes(12).toString("base64url");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params);

const { rows: [teacher] } = await q("select id from users where role='TEACHER' order by created_at limit 1");
if (!teacher) { console.log("还没有教师账号，请先运行 seed.mjs"); process.exit(1); }

if (process.argv.includes("--remove")) {
  for (const [title] of PLACEHOLDERS) {
    const r = await q(
      "delete from courses c where c.teacher_id=$1 and c.title=$2 and not exists (select 1 from lessons l where l.course_id=c.id)",
      [teacher.id, title],
    );
    console.log(r.rowCount ? `已删除 ${title}` : `跳过 ${title}（不存在或已有课时）`);
  }
} else {
  // 已有学生：加入教师现有课程班级的所有学生
  const { rows: students } = await q(
    `select distinct e.user_id from enrollments e join classes cl on cl.id=e.class_id
     join courses c on c.id=cl.course_id where c.teacher_id=$1`, [teacher.id]);
  for (const [title, description] of PLACEHOLDERS) {
    let { rows: [course] } = await q("select id from courses where teacher_id=$1 and title=$2", [teacher.id, title]);
    if (!course) {
      course = { id: id() };
      await q("insert into courses (id, title, description, teacher_id) values ($1,$2,$3,$4)", [course.id, title, description, teacher.id]);
      console.log(`已创建 ${title}`);
    } else console.log(`已存在 ${title}`);
    let { rows: [cls] } = await q("select id from classes where course_id=$1 order by created_at limit 1", [course.id]);
    if (!cls) {
      cls = { id: id() };
      await q("insert into classes (id, name, course_id) values ($1,'默认班级',$2)", [cls.id, course.id]);
    }
    for (const s of students)
      await q("insert into enrollments (user_id, class_id) values ($1,$2) on conflict do nothing", [s.user_id, cls.id]);
  }
  console.log(`占位课程已就绪，学生 ${students.length} 人已加入`);
}
await pool.end();
