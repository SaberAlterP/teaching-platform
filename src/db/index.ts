import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// 开发模式下热更新会重复创建连接池，挂到 globalThis 上复用
const g = globalThis as unknown as { __pgPool?: Pool };
const pool = g.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") g.__pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
