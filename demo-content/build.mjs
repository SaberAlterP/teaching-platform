// 构建示范内容：把 three.js 场景打包成单个 HTML 文件，方便直接上传到平台
import { build } from "esbuild";
import fs from "fs";
import path from "path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const src = (f) => path.join(dir, "src", f);
const out = (f) => path.join(dir, "dist", f);
fs.mkdirSync(path.join(dir, "dist"), { recursive: true });

const r = await build({ entryPoints: [src("transport-3d.js")], bundle: true, minify: true, format: "iife", write: false, target: "es2020", legalComments: "none" });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = fs.readFileSync(src("transport-3d.html"), "utf8").replace("/*BUNDLE*/", () => js);
fs.writeFileSync(out("五种运输方式-3D.html"), html);
fs.copyFileSync(src("dispatch-game.html"), out("物流调度小游戏.html"));
console.log("已生成：", fs.readdirSync(path.join(dir, "dist")).join("，"));
