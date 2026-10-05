# 项目说明（给 Claude 看）

教学实训平台：Next.js 15 + TypeScript + Tailwind + PostgreSQL（Drizzle）。部署在 2 核 4G 服务器上，服务器每 5 分钟拉 `origin/main` 自动构建更新（`scripts/tp-autoupdate.sh`），所以合并进 main 就等于上线。

## 每次改完代码必须做

1. `npm test`（单元测试，tests/ 目录，不需要数据库）
2. `npm run typecheck`
3. `npm run lint`
4. 改了后端逻辑（Server Action、/api 路由、登录权限、上传）时，再 `npm run build`，并起数据库和服务实际走一遍受影响的流程：
   - 本地 Postgres：`/usr/lib/postgresql/16/bin` 下有 initdb/pg_ctl（以 postgres 用户运行），`.env` 里填 `DATABASE_URL`、`AUTH_SECRET`、`UPLOAD_DIR`
   - `npm run db:migrate && npm run db:seed:demo`，然后 `next start`，用 Playwright（浏览器在 `/opt/pw-browsers`）模拟老师、学生操作

全部通过才提交。新增的纯逻辑（判分、入参检查、权限判断等）顺手在 tests/ 里补测试。

## 约定

- 项目作者不熟悉后端：说明用中文、讲清楚影响，不要留下需要他自己排查的耦合问题。
- 代码注释用中文，风格跟周围代码一致。
- 根目录的 `CLAUDE.md` 在 .gitignore 里，是作者本地用的，不要提交、不要去掉忽略规则。
- Server Action 的参数在运行时不可信：写数据库前只挑允许的字段（见 `src/lib/input.ts`），并检查归属（`assertLessonOwner` 等）。
- `/api` 路由用 `getApiUser()` 校验登录（会查数据库、核对令牌版本），不要只用 `getSession()`。
- 学生密码还是学号时只提示修改（学习页顶部提醒），不强制；老师默认密码首次登录强制修改。
- 改表结构用 `npx drizzle-kit generate --name xxx` 生成迁移，只加列/加表，服务器启动时自动迁移。
- 服务器只有 4G 内存：注意不要把大文件、全表数据一次读进内存。
