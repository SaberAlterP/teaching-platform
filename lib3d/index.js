// tp3d：平台内置 3D 部件库（AI 助手和老师做 3D 动画用），由 scripts/build-libs.mjs 打包成 /lib/tp3d/tp3d.js
// 用法：<script type="importmap">{"imports":{"three":"/lib/three/three.module.js","three/addons":"/lib/three/addons.js","tp3d":"/lib/tp3d/tp3d.js"}}</script>
//       import * as T from "tp3d";  const app = T.createApp({ title: "…" });
// 已上线的动画都在用它：只能新增部件和参数，不要改已有函数的含义和默认值。
export * from "./core.js";
export * from "./vehicles.js";
export * from "./air.js";
export * from "./goods.js";
export * from "./env.js";
export * from "./app.js";
