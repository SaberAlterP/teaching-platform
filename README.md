# 教学实训平台

一个模块化的课程与实训管理平台。教师把每堂课拼成一组“模块”（图文、图片视频、习题、互动网页），学生登录后按自己的进度学习、答题、玩实训游戏，教师可以查看进度和成绩统计。

目前是**第一期（框架演示版）**：单教师、单课程、单班级的界面，但数据库已经按“教师 → 课程 → 班级 → 学生”设计，以后扩展时不需要改表结构。

## 功能一览

| 角色 | 功能 |
| --- | --- |
| 教师 | 课时管理（新建、拖拽排序、复制、删除、导入/导出 JSON） |
|  | 模块编辑：图文（Markdown + 实时预览）、图片/视频、习题、HTML 互动包 |
|  | 习题：单选、多选、填空（自动判分）、简答（人工批改）；支持从文本批量粘贴导入 |
|  | 开放控制：草稿 / 立即开放 / 定时开放 |
|  | 学生管理：Excel 或粘贴导入名单、自动生成初始密码并下载、重置密码、登录二维码 |
|  | 批改简答题、成绩统计（每题得分率、课时完成率、分数分布、成绩册导出 Excel） |
| 学生 | 学号登录（首次强制改密码）、课程列表与进度、上课页面、答题、玩实训游戏、查看成绩 |

## 技术栈

- **Next.js 15**（App Router，前后端一体）+ TypeScript + Tailwind CSS
- **PostgreSQL** + **Drizzle ORM**
- **Docker Compose** 一键部署

## 目录结构

```
src/
  app/
    login/ account/        登录、改密码
    teacher/               教师端：课程内容、学生、批改、统计
    learn/                 学生端：课程、上课、成绩
    api/                   上传、文件下载、课时导出
    pkg/                   HTML 包的静态文件（沙箱运行）
  components/modules/      各类模块的展示组件（学生端和教师预览共用）
  db/schema.ts             数据库表结构
  lib/                     登录、权限、判分、文件存储等
drizzle/                   数据库迁移文件
scripts/                   migrate.mjs（迁移）、seed.mjs（初始化示范数据）
demo-content/              示范内容源码：3D 运输方式动画、物流调度小游戏
  dist/                    构建好的单文件 HTML，可直接在平台里上传
docs/                      HTML 包开发说明、部署说明
```

## 本地开发（Windows / Mac 通用）

需要：Node.js 20+、PostgreSQL 16（或者用 Docker 起一个数据库）。

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env        # Windows: copy .env.example .env
# 按需修改 .env 里的数据库连接

# 3. 建表 + 初始化示范数据（--demo 会额外生成 30 个演示学生和模拟作答）
npm run demo:build
npm run db:migrate
npm run db:seed:demo

# 4. 启动
npm run dev
```

打开 http://localhost:3000

- 教师：`teacher` / `teacher123`（首次登录会要求改密码）
- 演示学生：`240101` ~ `240130`，密码 `123456`

> 没装 PostgreSQL 的话，可以只用 Docker 起数据库：
> `docker run -d --name tp-db -e POSTGRES_USER=tp -e POSTGRES_PASSWORD=tp -e POSTGRES_DB=teaching -p 5432:5432 postgres:16-alpine`

## 部署到服务器

见 [docs/部署说明.md](docs/部署说明.md)。简要步骤：

```bash
git clone https://github.com/SaberAlterP/teaching-platform.git
cd teaching-platform
cp env.production.example .env      # 填好 DB_PASSWORD 和 AUTH_SECRET
docker compose up -d --build
docker compose exec app node scripts/seed.mjs   # 首次部署执行一次
```

## 往课程里放游戏、动画

任何网页都可以作为“互动内容（HTML 包）”上传：单个 `.html` 文件，或包含 `index.html` 的 `.zip`。包在隔离的沙箱里运行，读不到平台的登录信息。

游戏想把成绩记到平台里，只需要一行代码：

```js
parent.postMessage({ type: "tp:score", score: 85, max: 100 }, "*");
```

详见 [docs/HTML包开发说明.md](docs/HTML包开发说明.md)。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式启动 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run typecheck` | 类型检查 |
| `npm run db:generate` | 修改 `src/db/schema.ts` 后生成新的迁移文件 |
| `npm run db:migrate` | 执行迁移 |
| `npm run db:seed` / `db:seed:demo` | 初始化教师账号和示范课（demo 版带演示学生） |
| `npm run demo:build` | 重新构建示范 HTML 包 |

## 后续计划

- 多教师、多课程、多班级的界面
- 平台内置 AI 助手生成课程内容
- 更细的学习分析（答题用时、游戏过程数据）
- 移动端适配
