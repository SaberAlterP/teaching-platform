// 生成平台内置的前端库（public/lib/），供 AI 生成的 HTML 动画直接引用，不用每个动画都打包一份 three.js。
//   /lib/three/three.module.js  three.js（压缩后的 ES module）
//   /lib/three/addons.js        常用扩展：OrbitControls、RoundedBoxGeometry、mergeGeometries、CSS2DRenderer 等
// 用法（HTML 里）：
//   <script type="importmap">{"imports":{"three":"/lib/three/three.module.js","three/addons":"/lib/three/addons.js"}}</script>
import { build } from "esbuild";
import fs from "fs";
import path from "path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "public/lib/three");
fs.mkdirSync(out, { recursive: true });
const common = { bundle: true, minify: true, format: "esm", target: "es2020", legalComments: "none", logLevel: "warning" };

await build({ ...common, stdin: { contents: 'export * from "three";', resolveDir: root }, outfile: path.join(out, "three.module.js") });

const jsm = "./node_modules/three/examples/jsm/"; // 用相对路径：external 的 "three" 会连带把 three/xxx 子路径也当成外部
const addons = `
export { OrbitControls } from "${jsm}controls/OrbitControls.js";
export { MapControls } from "${jsm}controls/MapControls.js";
export { DragControls } from "${jsm}controls/DragControls.js";
export { RoundedBoxGeometry } from "${jsm}geometries/RoundedBoxGeometry.js";
export { ConvexGeometry } from "${jsm}geometries/ConvexGeometry.js";
export { mergeGeometries, mergeVertices } from "${jsm}utils/BufferGeometryUtils.js";
export { CSS2DRenderer, CSS2DObject } from "${jsm}renderers/CSS2DRenderer.js";
export { RoomEnvironment } from "${jsm}environments/RoomEnvironment.js";
export { Line2 } from "${jsm}lines/Line2.js";
export { LineGeometry } from "${jsm}lines/LineGeometry.js";
export { LineMaterial } from "${jsm}lines/LineMaterial.js";
export { LineSegments2 } from "${jsm}lines/LineSegments2.js";
export { LineSegmentsGeometry } from "${jsm}lines/LineSegmentsGeometry.js";
export { Sky } from "${jsm}objects/Sky.js";
export { SimplexNoise } from "${jsm}math/SimplexNoise.js";
`;
await build({ ...common, stdin: { contents: addons, resolveDir: root }, external: ["three"], outfile: path.join(out, "addons.js") });
for (const f of fs.readdirSync(out)) console.log(`public/lib/three/${f}  ${Math.round(fs.statSync(path.join(out, f)).size / 1024)}KB`);
