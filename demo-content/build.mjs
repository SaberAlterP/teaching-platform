// 构建示范内容：把 three.js 场景打包成单个 HTML 文件，方便直接上传到平台
import { build } from "esbuild";
import fs from "fs";
import path from "path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const src = (f) => path.join(dir, "src", f);
const out = (f) => path.join(dir, "dist", f);
fs.mkdirSync(path.join(dir, "dist"), { recursive: true });

// 入口 JS + HTML 外壳 → 单文件 HTML
async function bundle(entry, shell, file) {
  const r = await build({ entryPoints: [src(entry)], bundle: true, minify: true, format: "iife", write: false, target: "es2020", legalComments: "none" });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = fs.readFileSync(src(shell), "utf8").replace("/*BUNDLE*/", () => js);
  fs.writeFileSync(out(file), html);
}

await bundle("transport-3d.js", "transport-3d.html", "五种运输方式-3D.html");
await bundle("station/main.js", "station/index.html", "校园快递驿站-岗位实训仿真.html");
fs.copyFileSync(src("dispatch-game.html"), out("物流调度小游戏.html"));
console.log("已生成：", fs.readdirSync(path.join(dir, "dist")).join("，"));
