# HTML 包开发说明

“互动内容（HTML 包）”模块可以放进任何网页：小游戏、three.js 3D 场景、滚动叙事页面、模拟器、数据可视化……

## 能上传什么

- **单个 `.html` 文件**：最简单。JS、CSS 都写在文件里，或者从 CDN 引用。
- **`.zip` 压缩包**：包里要有 `index.html`（放在根目录，或者整体包在一个文件夹里都可以），其他资源（js、图片、音频、3D 模型 `.glb` 等）用**相对路径**引用。

单个文件不超过 200MB。几百个学生同时打开时，包越小加载越快，建议控制在 10MB 以内。

> 在大陆访问国外 CDN（如 unpkg、jsdelivr）可能很慢或打不开。建议把依赖库打包进 zip，或者像 `demo-content/build.mjs` 那样打包成单个 HTML。

## 运行环境（安全隔离）

包在一个 `sandbox` iframe 里运行，**没有** `allow-same-origin`，所以：

- 读不到平台的 Cookie 和登录状态，也调不了平台的接口 —— 一个有问题的游戏不会影响平台安全；
- `localStorage`、`sessionStorage`、`IndexedDB` **不可用**（会抛异常），游戏进度请保存在内存变量里；
- 可以运行脚本、使用 WebGL、全屏、弹出新窗口、表单。

## 与平台通信

在包里调用 `parent.postMessage(...)` 即可：

```js
// 上报成绩（模块需要在编辑器里勾选“计入成绩”才会记录；平台保留最高分）
parent.postMessage({ type: "tp:score", score: 85, max: 100, detail: { 用时秒: 320 } }, "*");

// 标记“已完成”（用于学习进度；不计分的内容也可以用）
parent.postMessage({ type: "tp:complete" }, "*");
```

- `score`：数字，会被限制在 0 到模块设置的满分之间；
- `max`：可选，仅用于提示；
- `detail`：可选，任意 JSON（小于 20KB），会保存下来，以后可用于更细的分析。

不计分的内容，学生看到它停留 3 秒后会自动记为“已完成”。

## 在教师编辑器里调试

上传后，编辑器下方会显示预览，并实时显示收到的消息（例如“收到包内消息：成绩 85 / 100”），方便确认通信是否正常。预览里的成绩不会保存。

## 用 AI 生成内容

可以直接在和 Claude 的对话里描述需求，例如：

> 做一个单文件 HTML 小游戏：学生扮演仓库管理员，……，结束时调用 `parent.postMessage({ type: "tp:score", score, max: 100 }, "*")` 上报成绩。不要使用 localStorage，不要依赖外部 CDN。

把生成的 HTML 保存成文件，上传即可。

## 示范内容

`demo-content/src/` 下有两个例子：

- `transport-3d.*`：three.js 滚动驱动的 3D 场景（`npm run demo:build` 打包成单文件）
- `dispatch-game.html`：纯 JS 的物流调度小游戏，演示成绩上报
