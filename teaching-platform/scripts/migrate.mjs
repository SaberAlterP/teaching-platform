// 启动前执行数据库迁移（生产环境容器启动时自动运行）
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
for (let i = 0; i < 30; i++) {
  try { await pool.query("select 1"); break; }
  catch { console.log("等待数据库启动..."); await new Promise((r) => setTimeout(r, 2000)); }
}
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
console.log("数据库迁移完成");
await pool.end();
