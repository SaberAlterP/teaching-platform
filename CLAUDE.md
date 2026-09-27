# 项目说明（给 AI 协作者）

教学实训平台：教师把课程拆成模块（图文 / 图片视频 / 习题 / HTML 互动包），学生登录后学习、答题、玩实训游戏，教师看统计。
当前是第一期：界面只做单教师、单课程、单班级，但数据库按 教师 → 课程 → 班级 → 学生 设计，扩展时不要破坏这个结构。

## 约定

- 界面文字、代码注释、文档一律用简体中文。
- 提交代码时**不要**添加任何 AI 署名（不加 Co-Authored-By 等），作者只用仓库主人本人。
- 技术栈：Next.js 15 App Router + TypeScript + Tailwind v4 + PostgreSQL + Drizzle ORM；部署用 Docker Compose。
- 改了 `src/db/schema.ts` 后运行 `npm run db:generate` 生成迁移文件并一起提交；不要手改 `drizzle/` 里已有的迁移。
- 服务端操作用 Server Actions（`src/app/teacher/actions.ts`、`src/app/learn/actions.ts`），每个 action 开头必须先 `requireTeacher()` / `requireStudent()` 并校验资源归属。
- 需要给用户看的错误，action 返回 `{ error }`，不要 throw（生产环境会隐藏 throw 的信息）。
- 学生端拿到的习题数据必须经过 `stripAnswers()`，提交前不能泄露答案。
- HTML 包在无 `allow-same-origin` 的沙箱 iframe 里运行，通过 `postMessage` 与平台通信（见 `docs/HTML包开发说明.md`）；不要放宽沙箱。
- 模块数据结构集中定义在 `src/lib/modules.ts`，新增模块类型时同时改：schema 枚举、`modules.ts`、编辑器（`teacher/lessons/[id]/editors/`）、展示组件（`components/modules/LessonView.tsx`）。

## 常用命令

```
npm run dev              # 开发
npm run typecheck        # 类型检查
npm run lint
npm run build
npm run db:migrate       # 执行迁移
npm run db:seed:demo     # 空库初始化示范课 + 30 个演示学生
npm run demo:build       # 重新打包 demo-content 里的示范 HTML
```

本地账号：教师 `teacher` / `teacher123`；演示学生 `240101`–`240130` / `123456`。

## 后续计划（第二期起）

多教师多班级界面、平台内置 AI 生成内容、更细的学习数据分析、移动端适配。
