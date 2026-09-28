# 教学实训平台

模块化的课程与实训管理平台。教师把每堂课拼成一组模块（图文、图片视频、习题、互动网页），学生登录后学习、答题、玩实训游戏，教师查看进度和成绩统计。

技术栈：Next.js 15 + TypeScript + Tailwind CSS + PostgreSQL（Drizzle ORM），Docker Compose 部署。

## 本地开发

需要 Node.js 20+ 和 PostgreSQL 16。

```bash
npm install
# 新建 .env，至少填写 DATABASE_URL 和 AUTH_SECRET
npm run demo:build
npm run db:migrate
npm run db:seed:demo   # 示范课 + 30 个演示学生
npm run dev            # http://localhost:3000
```

教师 `teacher` / `teacher123`（首次登录要求改密码）；演示学生 `240101`–`240130` / `123456`。

## 部署

```bash
git clone https://github.com/SaberAlterP/teaching-platform.git
cd teaching-platform
cp env.production.example .env   # 填好 DB_PASSWORD 和 AUTH_SECRET
docker compose up -d --build
docker compose exec app node scripts/seed.mjs   # 首次部署执行一次
```

更新：`git pull && docker compose up -d --build`（启动时自动执行数据库迁移）。
使用 HTTPS 反向代理时，在 `.env` 里设置 `COOKIE_SECURE=true` 和 `TRUST_PROXY=true`。

## HTML 互动包

可上传单个 `.html` 文件，或包含 `index.html` 的 `.zip`。包在无 `allow-same-origin` 的沙箱 iframe 里运行，不能使用 `localStorage`。通过 `postMessage` 与平台通信：

```js
parent.postMessage({ type: "tp:score", score: 85, max: 100 }, "*"); // 上报成绩（保留最高分）
parent.postMessage({ type: "tp:complete" }, "*");                    // 标记完成
```

示例见 `demo-content/src/`。

## AI 接口

教师在“AI 接口”页面生成密钥，交给 AI 助手后，它可以通过 `/api/ai` 读写本课程内容（请求头 `Authorization: Bearer tpk_...`）。能新建和修改课时、增删改模块、上传文件和 HTML 包；不能删除课时，也访问不到学生和成绩。`GET /api/ai` 返回全部接口说明。密钥只存哈希，可随时撤销。
