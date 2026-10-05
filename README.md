# 教学实训平台

模块化的课程与实训管理平台。教师把每堂课拼成一组模块（图文、图片视频、习题、互动网页），学生登录后学习、答题、玩实训游戏，教师查看进度和成绩统计。一位教师可以开多门课程，在顶部下拉框切换；课时、学生、批改和成绩统计都按课程分开。

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

学生账号规则：账号是学号，初始密码也是学号。学生用学号作密码登录时，学习页顶部会提醒修改密码（不强制，可点“以后再说”），改密码页不用再输当前密码。学生管理页可把单个学生或全班重置回学号。同时在其他老师课程里的学生，只有管理员能重置密码和改名。

## 测试

```bash
npm test        # 单元测试（判分、入参检查、上传路径安全等），不需要数据库，几秒跑完
npm run typecheck && npm run lint
```

改了判分、权限检查、上传相关的代码后跑一下；测试在 `tests/` 目录。

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

## 演示学生

`scripts/demo-students.mjs` 往当前数据库加一批随机学生（学号 `demo` 开头，密码就是学号）和作答记录，用来看成绩统计效果，可随时删干净：

```bash
docker compose exec app node scripts/demo-students.mjs [--count 40]   # 生成
docker compose exec app node scripts/demo-students.mjs --clean        # 删除
```

`scripts/demo-teachers.mjs` 往数据库加几位示例老师（账号 `demot01` 起，密码就是账号名），每人带一门课、几个课时和近 30 天的 AI 用量记录，用来看管理员的用量统计页面：

```bash
docker compose exec app node scripts/demo-teachers.mjs [--count 6]   # 生成
docker compose exec app node scripts/demo-teachers.mjs --clean       # 删除
```

管理员是叠加在老师上的身份（`users.is_admin`）：升级时最早创建的老师账号自动成为管理员，之后可在“管理 → 老师与管理员”里给其他老师开关。全站共用的 DeepSeek 密钥/模型也在管理页设置，用量按每次调用记录在 `ai_usage_log`。

## HTML 互动包

可上传单个 `.html` 文件，或包含 `index.html` 的 `.zip`。包在无 `allow-same-origin` 的沙箱 iframe 里运行，不能使用 `localStorage`。通过 `postMessage` 与平台通信：

```js
parent.postMessage({ type: "tp:score", score: 85, max: 100 }, "*"); // 上报成绩（保留最高分）
parent.postMessage({ type: "tp:complete" }, "*");                    // 标记完成
```

示例见 `demo-content/src/`。

平台内置 three.js（构建时由 `scripts/build-libs.mjs` 生成到 `public/lib/`），HTML 包里可以直接引用，不用自己打包：

```html
<script type="importmap">{"imports":{"three":"/lib/three/three.module.js","three/addons":"/lib/three/addons.js"}}</script>
```

## AI 接口

教师在“AI 接口”页面生成密钥，交给 AI 助手后，它可以通过 `/api/ai` 读写该教师所有课程的内容（用 `?course=<课程ID>` 指定课程）（请求头 `Authorization: Bearer tpk_...`）。能新建课程、新建和修改课时、增删改模块、上传文件和 HTML 包；不能删除课时，也访问不到学生和成绩。`GET /api/ai` 返回全部接口说明。密钥只存哈希，可随时撤销。

## AI 助手（DeepSeek）

教师后台“AI 助手”页面：在“设置”里填写 DeepSeek 密钥（加密保存在服务器，默认模型 `deepseek-flash`，可更换），然后用对话让 AI 直接修改课时、出题、做 HTML 互动动画、按大纲从零建课。

- AI 通过一组工具读写该教师自己的课程（`src/lib/ai/tools.ts`）；新建的课时都是草稿；修改已开放的课时、开放课时前会弹出确认；不能删除课时，看不到学生和成绩。
- 每一步改动都记录在 `ai_changes`，对话里可以逐条撤销（14 天内）。
- HTML 动画先写在对话的草稿区，右侧实时预览；预览页会把运行报错交回服务器，AI 检查、修复后再发布到课时。
- “技能”是写给 AI 的规范说明（画风、出题、建课流程、3D 写法等），内置的在 `src/lib/ai/skills.ts`，教师可以在页面上修改或新增。
- 同一时间最多运行 2 个 AI 任务，其余排队；服务器重启会中断正在运行的任务，点“继续”即可接着做。
