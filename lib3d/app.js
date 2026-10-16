// tp3d 应用外壳：渲染器、天空灯光、相机控制、标签、分步讲解播放器、小题、实训评分、成绩上报、氛围动效、自动降级
import * as THREE from "three";
import { OrbitControls, CSS2DRenderer, CSS2DObject } from "three/addons";
import { STATS, canvasTex, clamp, ease, path, V } from "./core.js";
import { birds, clouds, ground } from "./env.js";

const CSS = `
.tp3d-ui{--ink:#1f2a3a;--line:#243447;--brand:#1f5f9e;--ok:#16a34a;--bad:#dc2626;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:var(--ink)}
.tp3d-ui *{box-sizing:border-box}
.tp3d-panel{position:absolute;background:rgba(255,255,255,.94);border:2px solid var(--line);border-radius:12px;box-shadow:0 4px 0 rgba(36,52,71,.18);pointer-events:auto}
.tp3d-top{left:10px;top:10px;right:10px;display:flex;gap:10px;align-items:center;padding:7px 12px;flex-wrap:wrap}
.tp3d-top h1{font-size:16px;margin:0}
.tp3d-chip{font-size:12px;padding:2px 8px;border-radius:999px;background:#e8f0fb;color:var(--brand);font-weight:600}
.tp3d-score{margin-left:auto;font-weight:700;font-size:14px}
.tp3d-score small{font-weight:400;color:#64748b;margin-left:4px}
.tp3d-cap{left:50%;bottom:10px;transform:translateX(-50%);width:min(760px,calc(100% - 20px));padding:10px 14px 8px}
.tp3d-cap .t{font-weight:700;font-size:15px;margin-bottom:3px}
.tp3d-cap .d{font-size:14.5px;line-height:1.65;min-height:24px}
.tp3d-bar{height:4px;background:#e2e8f0;border-radius:4px;margin:8px 0 6px;overflow:hidden}.tp3d-bar i{display:block;height:100%;width:0;background:var(--brand)}
.tp3d-ctrl{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tp3d-ui button{font:inherit;font-size:13.5px;cursor:pointer;border:2px solid var(--line);background:#fff;border-radius:9px;padding:4px 11px;color:var(--ink)}
.tp3d-ui button:hover{background:#f1f5f9}.tp3d-ui button:disabled{opacity:.55;cursor:default}
.tp3d-ui button.primary{background:var(--brand);border-color:#163f6a;color:#fff}
.tp3d-ctrl .sp{flex:1}
.tp3d-side{right:10px;top:62px;width:min(340px,calc(100% - 20px));max-height:calc(100% - 250px);display:flex;flex-direction:column;overflow:hidden}
.tp3d-side.hide{display:none}
.tp3d-tabs{display:flex;border-bottom:2px solid var(--line)}.tp3d-tabs button{flex:1;border:0;border-radius:0;padding:7px 4px;background:#f8fafc}.tp3d-tabs button.on{background:#fff;font-weight:700;color:var(--brand)}
.tp3d-body{overflow:auto;padding:10px 12px;font-size:14px;line-height:1.6}
.tp3d-q{margin:0 0 12px;padding-bottom:10px;border-bottom:1px dashed #cbd5e1}.tp3d-q p{margin:0 0 6px;font-weight:600}
.tp3d-q button.opt{display:block;width:100%;text-align:left;margin:4px 0}
.tp3d-ui .right{background:#e3f6ea!important;border-color:var(--ok)!important}.tp3d-ui .wrong{background:#fde8e8!important;border-color:var(--bad)!important}
.tp3d-ex{font-size:13px;color:#475569;background:#f8fafc;border-left:3px solid var(--brand);padding:4px 8px;margin-top:6px}
.tp3d-toc button{display:block;width:100%;text-align:left;margin:3px 0;border-width:1px}.tp3d-toc button.on{border-color:var(--brand);background:#e8f0fb}
.tp3d-ask{left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,calc(100% - 24px));padding:14px 16px;z-index:5}
.tp3d-ask h3{margin:0 0 4px;font-size:15px;color:var(--brand)}
.tp3d-modal{position:absolute;inset:0;background:rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;z-index:9;pointer-events:auto}
.tp3d-modal .box{position:relative;max-width:min(560px,calc(100% - 24px));max-height:calc(100% - 40px);overflow:auto;padding:16px 18px}
.tp3d-modal .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.tp3d-toast{left:50%;top:64px;transform:translateX(-50%);padding:6px 14px;font-size:14px;z-index:8;transition:opacity .3s}
.tp3d-toast.ok{border-color:var(--ok)}.tp3d-toast.bad{border-color:var(--bad)}
.tp3d-label{background:#fff;border:2px solid #243447;border-radius:8px;padding:2px 8px;font-size:13px;white-space:nowrap;color:#1f2a3a;font-family:"PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 2px 0 rgba(36,52,71,.2)}
.tp3d-label.big{font-size:15px;font-weight:700;padding:4px 10px;border-color:#1f5f9e;color:#1f5f9e}
.tp3d-label.warn{border-color:#dc2626;color:#b91c1c;background:#fff5f5}
.tp3d-label.ok{border-color:#16a34a;color:#15803d;background:#f0fdf4}
.tp3d-label.num{border-radius:999px;background:#1f5f9e;color:#fff;border-color:#fff;font-weight:700;min-width:24px;text-align:center}
.tp3d-tog{right:10px;top:62px;display:none;padding:4px 10px}
@media (max-width:760px){.tp3d-side{top:auto;bottom:150px;max-height:42%}.tp3d-tog{display:block}.tp3d-side:not(.open){display:none}.tp3d-cap .d{font-size:13.5px}.tp3d-top h1{font-size:14px}}
`;

const SKIES = {
  day: { top: "#7fb3e0", bottom: "#e4eef6", fog: 0xd7e6f1, hemi: [0xeaf4ff, 0x9a9588, 1.35], sun: [0xfff2dc, 2.2] },
  dusk: { top: "#425a8a", bottom: "#f6c38b", fog: 0xe8c6a4, hemi: [0xffe2c4, 0x5a5560, 1.0], sun: [0xffc58a, 1.8] },
  indoor: { top: "#d6dde4", bottom: "#eef1f4", fog: 0xe6eaee, hemi: [0xffffff, 0xb0b4b8, 1.6], sun: [0xffffff, 1.4] },
};

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const shuffleIdx = (n) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const post = (m) => { try { parent.postMessage(m, "*"); } catch { /* 不在平台里打开时忽略 */ } };

// createApp({ title, sky: "day" | "dusk" | "indoor", ground: "concrete" | "apron" | "asphalt" | "floor" | "grass" | false, size: 160,
//             camera: { pos: [x,y,z], target: [x,y,z] }, ambient: true, shadowSize: 60 })
export function createApp(opts = {}) {
  const o = { title: "", sky: "day", ground: "concrete", size: 160, camera: { pos: [30, 22, 34], target: [0, 1, 0] }, ambient: true, shadowSize: 60, ...opts };
  const SK = SKIES[o.sky] ?? SKIES.day;
  if (!document.getElementById("tp3d-css")) { const s = el("style"); s.id = "tp3d-css"; s.textContent = CSS; document.head.appendChild(s); }
  Object.assign(document.documentElement.style, { height: "100%" });
  Object.assign(document.body.style, { margin: "0", height: "100%", overflow: "hidden", background: SK.bottom });
  const host = o.el ?? document.body;
  const root = el("div", "tp3d-ui"); root.style.cssText = "position:fixed;inset:0;overflow:hidden";
  host.appendChild(root);

  // ---------- 渲染 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  let ratio = Math.min(1.5, window.devicePixelRatio || 1);
  renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = "position:absolute;inset:0;display:block;touch-action:none";
  root.appendChild(renderer.domElement);
  const css2d = new CSS2DRenderer();
  css2d.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:1"; // 标签自带 z-index，包进一层免得盖住界面
  root.appendChild(css2d.domElement);
  const ui = el("div"); ui.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:2"; root.appendChild(ui);

  const scene = new THREE.Scene();
  scene.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, SK.top); gr.addColorStop(0.75, SK.bottom); gr.addColorStop(1, SK.bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scene.fog = new THREE.Fog(SK.fog, o.size * 1.2, o.size * 4);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, o.size * 8);
  camera.position.set(...o.camera.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...o.camera.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 2;
  controls.maxDistance = o.size * 2.5;
  scene.add(new THREE.HemisphereLight(SK.hemi[0], SK.hemi[1], SK.hemi[2]));
  const sun = new THREE.DirectionalLight(SK.sun[0], SK.sun[1]);
  const S = o.shadowSize;
  sun.position.set(S * 0.7, S * 1.3, S * 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: S * 4 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  if (o.ground) {
    scene.add(ground({ w: o.size, d: o.size, kind: o.ground }));
    if (o.ground !== "grass" && o.sky !== "indoor") { const far = ground({ w: o.size * 8, d: o.size * 8, kind: "grass", tile: 12, y: -0.03 }); STATS.zones--; scene.add(far); }
  }
  const world = new THREE.Group(); scene.add(world);
  const ambientGroup = new THREE.Group(); scene.add(ambientGroup);

  const resize = () => { const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight; renderer.setSize(w, h); css2d.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(root); resize();

  // ---------- 界面 ----------
  const top = el("div", "tp3d-panel tp3d-top", `<h1></h1><span class="tp3d-chip" hidden></span><span class="tp3d-score"></span>`);
  top.querySelector("h1").textContent = o.title || document.title || "";
  ui.appendChild(top);
  const chip = top.querySelector(".tp3d-chip"), scoreEl = top.querySelector(".tp3d-score");
  const side = el("div", "tp3d-panel tp3d-side hide", `<div class="tp3d-tabs"></div><div class="tp3d-body"></div>`);
  const tog = el("button", "tp3d-panel tp3d-tog", "题目 / 目录"); tog.onclick = () => side.classList.toggle("open");
  ui.append(side, tog);
  const tabsEl = side.querySelector(".tp3d-tabs"), bodyEl = side.querySelector(".tp3d-body");
  const tabs = new Map();
  let curTab = null;
  // 右侧面板加一个标签页，返回内容容器（自己往里写 HTML / 按钮）：app.panel("实训", { onShow() { … } })
  function panel(name, { onShow } = {}) {
    if (tabs.has(name)) return tabs.get(name).box;
    const b = el("button", "", name), box = el("div"); box.hidden = true;
    b.onclick = () => showTab(name);
    tabsEl.appendChild(b); bodyEl.appendChild(box);
    tabs.set(name, { b, box, onShow });
    side.classList.remove("hide");
    if (!curTab) showTab(name);
    return box;
  }
  function showTab(name) { for (const [n, t] of tabs) { t.b.classList.toggle("on", n === name); t.box.hidden = n !== name; } if (curTab !== name) tabs.get(name)?.onShow?.(); curTab = name; }
  let toastT = 0;
  const toastEl = el("div", "tp3d-panel tp3d-toast"); toastEl.style.opacity = 0; ui.appendChild(toastEl);
  function toast(msg, kind = "") { toastEl.innerHTML = msg; toastEl.className = "tp3d-panel tp3d-toast " + kind; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (toastEl.style.opacity = 0), 2600); }
  // 弹窗：await app.modal({ title, html, buttons: [{ text: "确定", value: 1, primary: true }] })
  function modal({ title = "", html = "", buttons = [{ text: "知道了", value: true, primary: true }] } = {}) {
    return new Promise((resolve) => {
      const m = el("div", "tp3d-modal"), box = el("div", "tp3d-panel box", (title ? `<h3 style="margin:0 0 8px">${title}</h3>` : "") + html);
      box.style.position = "relative";
      const bs = el("div", "btns");
      for (const b of buttons) { const x = el("button", b.primary ? "primary" : "", b.text); x.onclick = () => { m.remove(); resolve(b.value); }; bs.appendChild(x); }
      box.appendChild(bs); m.appendChild(box); ui.appendChild(m);
    });
  }

  // ---------- 成绩：小题 + 实训，按权重折算成 100 分 ----------
  const parts = new Map(); // name -> { weight, score, done }
  let best = 0, completed = false;
  function part(name, weight) { if (!parts.has(name)) parts.set(name, { weight, score: 0, done: false }); else if (weight != null) parts.get(name).weight = weight; return parts.get(name); }
  function total() { let w = 0, s = 0; for (const p of parts.values()) { w += p.weight; s += p.weight * p.score; } return w ? s / w : 0; }
  function refreshScore() {
    const t = Math.round(total());
    scoreEl.innerHTML = parts.size ? `得分 ${t} / 100<small>平台保留最高分</small>` : "";
    if (t > best || (t === best && t > 0)) { best = Math.max(best, t); post({ type: "tp:score", score: t, max: 100 }); }
    if (!completed && parts.size && [...parts.values()].every((p) => p.done)) { completed = true; post({ type: "tp:complete" }); toast(`全部完成，得分 ${t} 分`, "ok"); }
  }
  // 实训评分：const t = app.task("装车实训", 40); t.done(85)（0~100 分，可多次调用，保留最高）
  function task(name, weight = 50) {
    const p = part(name, weight);
    refreshScore();
    return { done(score) { p.score = Math.max(p.score, clamp(score, 0, 100)); p.done = true; refreshScore(); }, get score() { return p.score; } };
  }

  // ---------- 题目 ----------
  const questions = []; // { q, options, answer, explain, src, picked, order }
  let quizBox = null;
  const qPart = () => part("小题", parts.get("小题")?.weight ?? 100);
  function addQuestion(q, src) {
    const item = { ...q, src, picked: null, order: q.shuffle === false ? [...q.options.keys()] : shuffleIdx(q.options.length) };
    item.multi = Array.isArray(q.answer);
    questions.push(item);
    qPart(); refreshScore();
    return item;
  }
  function isRight(item) { if (item.picked == null) return false; if (!item.multi) return item.picked === item.answer; const a = [...item.answer].sort().join(), b = [...item.picked].sort().join(); return a === b; }
  function scoreQuestions() {
    const p = qPart();
    p.score = questions.length ? (questions.filter(isRight).length / questions.length) * 100 : 0;
    p.done = questions.every((x) => x.picked != null);
    refreshScore();
    renderQuiz();
  }
  function questionEl(item, i, onDone) {
    const d = el("div", "tp3d-q");
    const p = el("p"); p.textContent = `${i != null ? i + 1 + ". " : ""}${item.q}${item.multi ? "（多选）" : ""}`; d.appendChild(p);
    const sel = new Set();
    const btns = item.order.map((oi) => {
      const b = el("button", "opt"); b.textContent = item.options[oi];
      const ans = item.multi ? item.answer.includes(oi) : item.answer === oi;
      if (item.picked != null) { b.disabled = true; const mine = item.multi ? item.picked.includes(oi) : item.picked === oi; if (ans) b.classList.add("right"); else if (mine) b.classList.add("wrong"); }
      else b.onclick = () => {
        if (!item.multi) { item.picked = oi; onDone?.(); scoreQuestions(); return; }
        if (sel.has(oi)) sel.delete(oi); else sel.add(oi);
        b.classList.toggle("primary", sel.has(oi));
      };
      d.appendChild(b); return b;
    });
    if (item.multi && item.picked == null) { const ok = el("button", "primary", "提交"); ok.style.marginTop = "4px"; ok.onclick = () => { if (!sel.size) return; item.picked = [...sel]; onDone?.(); scoreQuestions(); }; d.appendChild(ok); }
    if (item.picked != null) { d.appendChild(el("div", "tp3d-ex", `${isRight(item) ? "✔ 回答正确。" : "✘ 回答错误。"}${item.explain ? " " + item.explain : ""}`)); }
    void btns;
    return d;
  }
  function renderQuiz() {
    if (!quizBox) return;
    quizBox.innerHTML = "";
    const done = questions.filter((x) => x.picked != null).length;
    quizBox.appendChild(el("div", "", `<b>共 ${questions.length} 题，已答 ${done} 题</b>（每题只能作答一次）`)).style.marginBottom = "8px";
    questions.forEach((it, i) => quizBox.appendChild(questionEl(it, i)));
  }
  // 小题：app.quiz([{ q: "题干", options: ["A", "B", "C"], answer: 1, explain: "解析" }, ...], { weight: 100 })；answer 为数组时是多选
  function quiz(list, { weight, title = "小题" } = {}) {
    if (weight != null) part("小题", weight);
    quizBox = panel(title);
    list.forEach((q) => addQuestion(q, "quiz"));
    renderQuiz();
  }

  // ---------- 标签 ----------
  const labels = new Set();
  let stepLabels = null;
  // app.label("月台", obj 或 [x,y,z], { kind: "tag" | "big" | "warn" | "ok" | "num", dy: 0.5, keep: false })，返回 { remove(), set(text), obj }
  // 在讲解步骤里创建的标签，换步时自动删除；keep: true 则一直保留
  function label(text, target, { kind = "tag", dy = 0.4, html = false, keep = false } = {}) {
    const div = el("div", "tp3d-label " + (kind === "tag" ? "" : kind));
    const put = (t) => { if (html) div.innerHTML = t; else div.textContent = t; };
    put(text);
    const obj = new CSS2DObject(div);
    if (Array.isArray(target) || target?.isVector3) { obj.position.copy(Array.isArray(target) ? V(...target) : target); scene.add(obj); }
    else { const b = new THREE.Box3().setFromObject(target); const h = b.isEmpty() ? 1 : (b.max.y - target.getWorldPosition(V()).y) / (target.getWorldScale(V()).y || 1); obj.position.set(0, h + dy, 0); target.add(obj); }
    const L = { obj, el: div, remove() { obj.removeFromParent(); div.remove(); labels.delete(L); stepLabels?.delete(L); }, set: put, show(v) { obj.visible = v; } };
    labels.add(L); if (!keep) stepLabels?.add(L);
    STATS.labels++;
    return L;
  }

  // ---------- 相机 ----------
  let fly = null;
  // app.flyTo([x,y,z] 相机位置, [x,y,z] 看向的点, 秒数)
  function flyTo(pos, target, sec = 1.4) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: V(...pos), t1: V(...target), t: 0, sec: Math.max(0.01, sec) }; }

  // ---------- 每帧更新 ----------
  const tickers = new Set();
  // app.onTick((dt, t) => { ... }) 每帧调用；返回取消函数
  function onTick(fn) { tickers.add(fn); return () => tickers.delete(fn); }
  // app.add(obj, x, y, z, ry)：放进场景；部件自带的动效（风扇、皮带、灯）会自动跑
  function add(obj, x = 0, y = 0, z = 0, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; world.add(obj); return obj; }
  const partTicks = [];
  let scanAt = 0;
  function scanTicks() { partTicks.length = 0; scene.traverse((ob) => { if (ob.userData && typeof ob.userData.tick === "function") partTicks.push(ob); }); }

  // 沿路线移动（按时间，适合背景车辆/人员循环走动）：app.moveAlong(obj, [[x,z], ...], { speed: 3, loop: true, smooth: false })
  function moveAlong(obj, points, { speed = 3, loop = false, smooth = false, y = 0, onDone, ambient = false } = {}) {
    const pth = path(points, { smooth, y });
    let s = 0, stopped = false;
    const off = onTick((dt) => {
      if (stopped || (ambient && lite)) return;
      s += speed * dt;
      if (s >= pth.length) { if (loop) s %= pth.length; else { s = pth.length; pth.place(obj, 1); stopped = true; off(); onDone?.(); return; } }
      pth.place(obj, s / pth.length);
    });
    pth.place(obj, 0);
    if (ambient) { obj.userData.ambient = true; STATS.ambient++; }
    return { stop() { stopped = true; off(); }, path: pth };
  }
  // 背景氛围：app.ambient({ traffic: [{ obj: T.van(), points: [[x,z],...], speed: 6 }], people: [{ obj: T.person(), points, speed: 1.3 }] })
  function ambient({ traffic = [], people = [] } = {}) {
    for (const it of [...traffic, ...people]) { ambientGroup.add(it.obj); moveAlong(it.obj, it.points, { speed: it.speed ?? (people.includes(it) ? 1.3 : 6), loop: true, smooth: it.smooth, ambient: true }); }
  }
  if (o.ambient && o.sky !== "indoor") { ambientGroup.add(clouds({ area: o.size * 1.5, y: Math.max(40, o.size * 0.45) }), birds({ r: o.size * 0.3, y: Math.max(18, o.size * 0.15) })); }

  // ---------- 点选 ----------
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const pickers = [];
  // app.pick([obj1, obj2], (obj) => { ... })：点击这些物体时回调（鼠标移上去变手形）；返回取消函数
  function pickFn(objs, cb) { const p = { objs, cb }; pickers.push(p); return () => pickers.splice(pickers.indexOf(p), 1); }
  function hit(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    for (const p of pickers) {
      const hits = ray.intersectObjects(p.objs.filter((x) => x.visible), true);
      for (const h of hits) { let ob = h.object; while (ob && !p.objs.includes(ob)) ob = ob.parent; if (ob) return { p, ob }; }
    }
    return null;
  }
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener("pointerup", (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; const h = hit(e); if (h) h.p.cb(h.ob); });
  renderer.domElement.addEventListener("pointermove", (e) => { if (pickers.length && e.buttons === 0) renderer.domElement.style.cursor = hit(e) ? "pointer" : ""; });
  // 高亮框：const h = app.highlight(obj, 0xfacc15)；h.remove() 取消
  function highlight(obj, color = 0xfacc15) {
    const box = new THREE.Box3(), helper = new THREE.Box3Helper(box, color);
    helper.material.depthTest = false; helper.material.transparent = true; helper.renderOrder = 10;
    scene.add(helper);
    const off = onTick((dt, t) => { box.setFromObject(obj).expandByScalar(0.15); helper.material.opacity = 0.55 + Math.sin(t * 6) * 0.4; });
    return { remove() { off(); helper.removeFromParent(); } };
  }

  // ---------- 分步讲解 ----------
  // app.steps([{ title, text, dur: 6, cam: { pos, target }, enter(), update(p, dt), ask: { q, options, answer, explain } }, ...])
  // update(p) 里按进度 p（0~1）设置物体的“绝对状态”（例如 obj.position.x = lerp(-20, 0, p)），这样上一步/下一步跳转不会乱。
  let player = null;
  function steps(list, { autoplay = true } = {}) {
    const cap = el("div", "tp3d-panel tp3d-cap", `<div class="t"></div><div class="d"></div><div class="tp3d-bar"><i></i></div><div class="tp3d-ctrl"><button data-a="prev">上一步</button><button data-a="play" class="primary">暂停</button><button data-a="next">下一步</button><span class="sp"></span><button data-a="replay">重播</button></div>`);
    ui.appendChild(cap);
    const tEl = cap.querySelector(".t"), dEl = cap.querySelector(".d"), bar = cap.querySelector(".tp3d-bar i"), playB = cap.querySelector('[data-a="play"]');
    const toc = panel("讲解目录"); toc.classList.add("tp3d-toc");
    const tocB = list.map((s, i) => { const b = el("button", "", `${i + 1}. ${s.title}`); b.onclick = () => go(i); toc.appendChild(b); return b; });
    const asks = list.map((s) => (s.ask ? addQuestion(s.ask, "step") : null));
    const st = { i: -1, t: 0, playing: autoplay, waiting: false, hold: 0, finished: false };
    let askCard = null;
    function setPlaying(v) { st.playing = v; playB.textContent = v ? "暂停" : "播放"; }
    function go(i) {
      i = clamp(i, 0, list.length - 1);
      askCard?.remove(); askCard = null; st.waiting = false;
      if (stepLabels) for (const L of [...stepLabels]) L.remove();
      for (let j = list.length - 1; j > i; j--) list[j].update?.(0, 0);
      for (let j = 0; j < i; j++) { stepLabels = new Set(); list[j].enter?.(); list[j].update?.(1, 0); for (const L of stepLabels) L.remove(); }
      st.i = i; st.t = 0; st.hold = 0; st.finished = false;
      stepLabels = new Set();
      const s = list[i];
      s.enter?.();
      s.update?.(0, 0);
      tEl.textContent = `第 ${i + 1}/${list.length} 步 · ${s.title}`;
      dEl.innerHTML = s.text ?? "";
      chip.hidden = false; chip.textContent = s.title;
      tocB.forEach((b, j) => b.classList.toggle("on", j === i));
      if (s.cam) flyTo(s.cam.pos, s.cam.target, s.cam.sec ?? 1.6);
      cap.querySelector('[data-a="prev"]').disabled = i === 0;
    }
    function showAsk(item) {
      st.waiting = true;
      askCard = el("div", "tp3d-panel tp3d-ask", `<h3>随堂小问</h3>`);
      const box = questionEl(item, null, () => {});
      askCard.appendChild(box);
      const go2 = el("button", "primary", "继续"); go2.style.marginTop = "6px"; go2.hidden = true;
      go2.onclick = () => { askCard.remove(); askCard = null; st.waiting = false; st.hold = 99; };
      askCard.appendChild(go2);
      ui.appendChild(askCard);
      const watch = onTick(() => { if (item.picked != null && askCard) { const nb = questionEl(item, null); askCard.replaceChild(nb, askCard.children[1]); go2.hidden = false; watch(); } if (!askCard) watch(); });
    }
    cap.querySelector('[data-a="prev"]').onclick = () => go(st.i - 1);
    cap.querySelector('[data-a="next"]').onclick = () => (st.i < list.length - 1 ? go(st.i + 1) : null);
    cap.querySelector('[data-a="replay"]').onclick = () => { go(0); setPlaying(true); };
    playB.onclick = () => setPlaying(!st.playing);
    player = {
      list, st, go,
      tick(dt) {
        if (st.i < 0) return;
        const s = list[st.i], dur = s.dur ?? 6;
        if (st.playing && !st.waiting) st.t = Math.min(dur, st.t + dt);
        const p = st.t / dur;
        s.update?.(p, dt);
        bar.style.width = `${(p * 100).toFixed(1)}%`;
        if (p >= 1 && !st.waiting) {
          const a = asks[st.i];
          if (a && a.picked == null && !askCard) { showAsk(a); return; }
          st.hold += dt;
          if (st.playing && st.hold > 1.2) {
            if (st.i < list.length - 1) go(st.i + 1);
            else if (!st.finished) { st.finished = true; setPlaying(false); toast("讲解播放完了，可以去做小题，或点任意一步重看", "ok"); if (quizBox) showTab([...tabs.keys()].find((n) => tabs.get(n).box === quizBox)); }
          }
        }
      },
    };
    setTimeout(() => go(0), 0);
    return player;
  }

  // ---------- 帧循环与自动降级 ----------
  let lite = false, slow = 0, frames = 0, tri = 0, fpsAvg = 60;
  function degrade() {
    if (lite) return;
    lite = true;
    renderer.shadowMap.enabled = false; renderer.setPixelRatio((ratio = 1));
    scene.traverse((ob) => { if (ob.material) ob.material.needsUpdate = true; if (ob.userData?.ambient) ob.visible = false; });
    ambientGroup.visible = false;
    resize();
  }
  let time = 0, last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    frames++;
    fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    if (frames > 90 && dt > 1 / 28) { if (++slow > 75) degrade(); } else slow = Math.max(0, slow - 1);
    if (time > scanAt) { scanTicks(); scanAt = time + 0.5; }
    for (const ob of partTicks) if (!(lite && ob.userData.ambient)) ob.userData.tick(dt, time);
    for (const fn of [...tickers]) fn(dt, time);
    player?.tick(dt);
    if (fly) { fly.t += dt; const k = ease(fly.t / fly.sec); camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k); if (fly.t >= fly.sec) fly = null; }
    controls.update();
    renderer.render(scene, camera);
    css2d.render(scene, camera);
    tri = Math.max(tri, renderer.info.render.triangles);
  });

  // 给平台检查用的统计（html_check 读取，判断画面是否太空）
  function stats() {
    let meshes = 0; scene.traverse((ob) => { if (ob.isMesh) meshes++; });
    return { parts: STATS.parts, kinds: [...STATS.kinds], meshes, triangles: tri, labels: STATS.labels, zones: STATS.zones, ambient: STATS.ambient + partTicks.length, steps: player?.list.length ?? 0, asks: questions.filter((q) => q.src === "step").length, questions: questions.length, tasks: [...parts.keys()].filter((n) => n !== "小题").length, fps: Math.round(fpsAvg), lite };
  }
  const app = { scene, camera, renderer, controls, world, root: ui, sun, add, onTick, label, flyTo, moveAlong, ambient, pick: pickFn, highlight, steps, quiz, task, panel, showTab, toast, modal, stats, get lite() { return lite; }, get time() { return time; }, degrade };
  window.__tp3d = { version: VERSION, stats };
  return app;
}

export const VERSION = "1.0";
