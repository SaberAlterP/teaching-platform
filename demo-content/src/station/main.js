// 校园快递驿站 · 岗位实训仿真（单个大场景）
// 构建：npm run demo:build → demo-content/dist/校园快递驿站-岗位实训仿真.html（单文件，可直接上传到平台）
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { buildWorld } from "./world.js";
import { Person, LOOKS } from "./people.js";
import { $, toast, panel, device, overlay, beep } from "./ui.js";
import { ZONES, DEVICES } from "./data.js";
import { initTasks } from "./tasks.js";

// ---------- 渲染器 ----------
const host = $("#scene");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
let pixelRatio = Math.min(1.5, window.devicePixelRatio || 1);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#cdd8e3", 70, 260);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 900);
scene.add(camera);

const W = buildWorld(scene, renderer);

// 环境光遮蔽（GTAO）：墙角、货架下、包裹缝隙自然变暗，画面更真实；电脑带不动时自动关闭
let composer = null, aoPass = null;
const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
function makeComposer() {
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  const rt = new THREE.WebGLRenderTarget(w * pixelRatio, h * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  aoPass = new GTAOPass(scene, camera, w, h);
  aoPass.output = GTAOPass.OUTPUT.Default;
  aoPass.blendIntensity = 0.85;
  aoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 12 });
  aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  const setAO = aoPass.setSize.bind(aoPass);
  aoPass.setSize = (a, b) => setAO(Math.ceil(a / 2), Math.ceil(b / 2)); // 半分辨率计算，省一半开销
  composer.addPass(aoPass);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
}
function dropComposer() { if (composer) { composer.dispose(); aoPass.dispose(); composer = null; aoPass = null; } }
try { if (!mobile) makeComposer(); } catch (e) { console.warn("GTAO 不可用", e); composer = null; }

function resize() {
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  renderer.setSize(w, h);
  if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(w, h); }
  camera.aspect = w / h; camera.fov = w / h < 1 ? 75 : 62; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();

// ---------- 玩家（第一人称） ----------
const EYE = 1.62;
const P = { x: 0, z: 15.5, eye: EYE, yaw: 0, pitch: -0.02, mode: "free", path: null, fly: null };
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,textarea,select")) return;
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

const waiters = []; // 每帧检查的条件
const until = (cond) => new Promise((res) => waiters.push({ cond, res }));
const tweens = [];
function tween(dur, fn) {
  return new Promise((res) => tweens.push({ t: 0, dur, fn, res }));
}
const wait = (ms) => tween(ms / 1000, () => {});

function lookAngles(eye, look) {
  const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
function flyTo(pose, dur = 0.8) {
  const { yaw, pitch } = lookAngles(pose.eye, pose.look);
  P.path = null;
  return new Promise((res) => {
    let dy = yaw - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    P.fly = { from: { x: P.x, z: P.z, eye: P.eye, yaw: P.yaw, pitch: P.pitch }, to: { x: pose.eye[0], z: pose.eye[2], eye: pose.eye[1], yaw: P.yaw + dy, pitch }, t: 0, dur, res };
    P.mode = "fly";
  });
}
function walkTo(x, z) {
  const path = W.grid.path(P.x, P.z, x, z);
  if (!path) { toast("那里走不过去"); return Promise.resolve(false); }
  P.mode = "auto"; P.path = path.slice(1);
  return until(() => P.mode !== "auto" || !P.path);
}
function release() { if (P.mode === "locked" || P.mode === "fly") { P.mode = "free"; P.fly = null; } }

// ---------- 交互：拾取与高亮 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dyn = new Set(); // 运行中添加的可点击对象（包裹等）
let clickWait = null;
function pickAt(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const list = [...W.pick, ...dyn, W.floor, W.ground, ...W.blockers];
  const hits = ray.intersectObjects(list, true);
  for (const h of hits) {
    if (h.object.isLine || (h.object.material && h.object.material.visible === false)) continue;
    let o = h.object;
    while (o && !o.userData.pick && !o.userData.parcel && o !== W.floor && o !== W.ground && !W.blockers.includes(o)) o = o.parent;
    if (!o) continue;
    if (!o.visible) continue;
    if (o === W.floor || o === W.ground) return { floor: true, point: h.point, dist: h.distance };
    if (W.blockers.includes(o)) return null;
    if (o.userData.pick && o.userData.pick.filler) return { filler: W.fillers.itemAt(o, h.faceIndex), point: h.point, obj: o, dist: h.distance };
    return { obj: o, point: h.point, dist: h.distance };
  }
  return null;
}
function nameOf(hit) {
  if (!hit) return "";
  if (hit.filler) return `在库包裹 · 取件码 ${hit.filler.code}`;
  const o = hit.obj;
  if (o.userData.parcel) { const p = o.userData.parcel; return `包裹 ${p.code ? "· 取件码 " + p.code : "· " + p.no}`; }
  if (o.userData.pick) return o.userData.pick.name;
  return "";
}
// 发光高亮
const hlSet = new Set();
function hl(obj, on) {
  obj.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    if (on) {
      if (!m.userData.hlOrig) {
        m.userData.hlOrig = m.material;
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
      }
      hlSet.add(m);
    } else if (m.userData.hlOrig) {
      const c = m.material; m.material = m.userData.hlOrig; delete m.userData.hlOrig;
      (Array.isArray(c) ? c : [c]).forEach((x) => x.dispose());
      hlSet.delete(m);
    }
  });
}
function hlPulse(t) {
  const v = 0.25 + Math.sin(t * 5) * 0.2;
  for (const m of hlSet) for (const x of Array.isArray(m.material) ? m.material : [m.material]) if (x.emissive) { x.emissive.set("#3b82f6"); x.emissiveIntensity = v; }
}
// 指示标（地面光圈 + 浮动箭头）
const beacon = new THREE.Group();
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#2f6fed", transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.01;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: "#2f6fed" }));
  arrow.position.y = 1.9;
  beacon.add(ring, arrow); beacon.userData.arrow = arrow; beacon.userData.ring = ring; beacon.visible = false;
  scene.add(beacon);
}
let beaconTarget = null;
function setBeacon(x, z, y = 0) { beacon.visible = true; beacon.position.set(x, y, z); beaconTarget = [x, z]; }
function clearBeacon() { beacon.visible = false; beaconTarget = null; }

// ---------- 指针 ----------
const cvs = renderer.domElement;
let down = null;
const tip = $("#tip");
cvs.addEventListener("contextmenu", (e) => e.preventDefault()); // 右键拖动也能转视角
// ---------- 鼠标视角（像第一人称游戏）：点一下画面锁定鼠标，移动鼠标就转视角，用准星点物体 ----------
const canLock = "requestPointerLock" in cvs && !mobile;
let lookMode = canLock;
const isLocked = () => document.pointerLockElement === cvs;
// 题目、对话、设备屏幕等需要鼠标点按钮时，自动释放鼠标
function needsCursor() {
  if (overlay.open || !$("#dialog").hidden || $("#qbox").children.length) return true;
  const d = $("#device");
  if (!d.hidden && d.dataset.dex !== "1" && d.querySelector("[data-act]:not(:disabled),[data-cell]:not(:disabled),input:not(:disabled),select")) return true;
  return !!$("#instrBtns").querySelector("button:not([data-soft])");
}
let lockAsked = 0;
function lockMouse() {
  if (!lookMode || isLocked() || needsCursor() || performance.now() - lockAsked < 400) return;
  lockAsked = performance.now();
  try { const r = cvs.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* 浏览器不允许时保持拖动模式 */ }
}
function updateLookUI() {
  const locked = isLocked();
  document.body.classList.toggle("locked", locked);
  $("#bLook").hidden = !canLock;
  $("#bLook").textContent = lookMode ? "鼠标视角：开" : "鼠标视角：关";
  $("#hint").innerHTML = locked
    ? "移动鼠标转视角 · 准星对准物体<b>点击</b>操作 · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动 · <kbd>Esc</kbd> 释放鼠标"
    : lookMode
      ? "<b>点一下画面</b>进入鼠标视角（移动鼠标就能转身）· 也可按住鼠标拖动 · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动"
      : "按住鼠标拖动环视（或 <kbd>Q</kbd><kbd>E</kbd> 转身）· <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动 · 点地面走过去 · 点发光物体操作";
}
let lockedAt = 0;
document.addEventListener("pointerlockchange", () => { lockedAt = performance.now(); updateLookUI(); tip.style.display = "none"; });
$("#bLook").onclick = () => { lookMode = !lookMode; if (!lookMode && isLocked()) document.exitPointerLock(); updateLookUI(); };
updateLookUI();

cvs.addEventListener("pointerdown", (e) => {
  // 阻止浏览器默认的选中文字/拖拽行为：它们会中断后续的移动事件，表现为“拖不动视角”
  e.preventDefault();
  if (isLocked()) { if (e.button === 0) onClick(innerWidth / 2, innerHeight / 2); return; } // 锁定时：准星处点击
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // 让 WASD 回到场景
  down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false, id: e.pointerId, btn: e.button };
  try { cvs.setPointerCapture(e.pointerId); } catch { /* 个别浏览器不支持也没关系，下面在 window 上监听移动 */ }
});
const endDrag = (e) => {
  if (!down || (e && e.pointerId !== undefined && e.pointerId !== down.id)) return null;
  const d = down; down = null; return d;
};
addEventListener("pointercancel", endDrag);
addEventListener("blur", () => { down = null; });
// 移动监听在 window 上：指针滑到面板、准星上也不会丢
addEventListener("pointermove", (e) => {
  if (isLocked()) {
    // 刚锁定时部分浏览器会报一次很大的位移，忽略；单次位移也限幅，防止视角乱跳
    if (P.mode !== "fly" && performance.now() - lockedAt > 120) {
      const k = 0.0022, cl = (v) => Math.max(-120, Math.min(120, v || 0));
      e = { movementX: cl(e.movementX), movementY: cl(e.movementY) };
      P.yaw -= (e.movementX || 0) * k; P.pitch = THREE.MathUtils.clamp(P.pitch - (e.movementY || 0) * k, -1.35, 1.0);
    }
    return;
  }
  if (down) {
    if (e.pointerId !== down.id) return;
    if (e.pointerType === "mouse" && e.buttons === 0) { down = null; return; } // 鼠标在窗口外松开了
    const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.drag = true;
    if (down.drag && P.mode !== "fly") {
      const k = e.pointerType === "touch" ? 0.006 : 0.0042;
      P.yaw += dx * k; P.pitch = THREE.MathUtils.clamp(P.pitch + dy * k, -1.35, 1.0);
    }
    down.lx = e.clientX; down.ly = e.clientY;
    tip.style.display = "none";
    return;
  }
  hoverXY = e.target === cvs ? [e.clientX, e.clientY] : null;
  if (!hoverXY) tip.style.display = "none";
});
cvs.addEventListener("pointerleave", () => { hoverXY = null; tip.style.display = "none"; });
addEventListener("pointerup", (e) => {
  const d = endDrag(e);
  if (!d || d.drag || d.btn !== 0) return;
  // 鼠标视角开着、又没有面板要点时，单击画面 = 进入鼠标视角；否则照常点选
  if (lookMode && !needsCursor()) lockMouse(); else onClick(e.clientX, e.clientY);
});
let hoverXY = null, hoverFrame = 0;
function updateHover() {
  if (isLocked()) hoverXY = [innerWidth / 2, innerHeight / 2];
  if (!hoverXY || down) return;
  const h = pickAt(hoverXY[0], hoverXY[1]);
  const n = h && !h.floor ? nameOf(h) : "";
  const targetHit = h && clickWait && matchTarget(h);
  cvs.style.cursor = n ? "pointer" : "default";
  if (n) { tip.textContent = (targetHit ? "👉 " : "") + n; tip.style.display = "block"; tip.style.left = hoverXY[0] + 14 + "px"; tip.style.top = hoverXY[1] + 12 + "px"; }
  else tip.style.display = "none";
  document.body.classList.toggle("aim", !!n && isLocked());
}
function matchTarget(h) {
  if (!clickWait) return null;
  for (const t of clickWait.targets) {
    if (typeof t === "function") { if (t(h)) return t; continue; }
    let o = h.obj;
    while (o) { if (o === t) return t; o = o.parent; }
  }
  return null;
}
function onClick(x, y) {
  const h = pickAt(x, y);
  if (clickWait) {
    if (h && !h.floor) {
      const t = matchTarget(h);
      if (t) { const cw = clickWait; clickWait = null; cw.targets.forEach((o) => typeof o !== "function" && hl(o, false)); cw.res({ target: t, hit: h }); return; }
      if (clickWait.onOther && clickWait.onOther(h)) return;
    }
  }
  if (!h) return;
  if (h.floor) {
    if (P.mode === "free" || P.mode === "auto") walkTo(h.point.x, h.point.z);
    else if (P.mode === "locked" && !clickWait) toast("正在操作设备，完成当前步骤后可自由走动");
    return;
  }
  const pk = h.obj && h.obj.userData.pick;
  if (pk && pk.dev) G.onDevice(pk.dev);
  else if (h.filler || (h.obj && h.obj.userData.parcel)) toast(nameOf(h));
}
// 等待点击某些对象；targets 里可以是 Object3D 或判断函数 (hit)=>bool
function clickOn(targets, o = {}) {
  if (!Array.isArray(targets)) targets = [targets];
  if (o.hl !== false) targets.forEach((t) => typeof t !== "function" && hl(t, true));
  return new Promise((res) => { clickWait = { targets, res, onOther: o.onOther }; });
}

// ---------- 人物 ----------
const people = [];
const blobGeo = new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ alphaMap: W.blobTex, color: "#000", transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
function spawn(look, x, z, face = 0, name = "") {
  const p = new Person({ ...LOOKS[look], name });
  p.at(x, z, face);
  const b = new THREE.Mesh(blobGeo, blobMat); b.position.y = 0.006; p.g.add(b);
  scene.add(p.g); people.push(p);
  return p;
}
function despawn(p) { scene.remove(p.g); const i = people.indexOf(p); if (i >= 0) people.splice(i, 1); }
// 校园里的路人
const walkers = [];
for (const [k, x, z, sp] of [["walker1", -25, 14.6, 1.2], ["walker2", 10, 14.9, 1.05], ["walker3", 30, 14.4, 1.3]]) {
  const p = spawn(k, x, z); p.speed = sp; p.dir = x > 0 ? -1 : 1; walkers.push(p);
  p.path = [new THREE.Vector2(p.dir * 35, z)];
}
// 企业导师（站在服务台附近）
const mentor = spawn("coworker", 10.6, 6.6, -Math.PI / 2, "王师傅");

// ---------- 小地图 ----------
const mapC = $("#mapC"), mg = mapC.getContext("2d");
const MAP = { x0: -13.5, x1: 13.5, z0: -9.5, z1: 13.6 };
const ms = Math.min(mapC.width / (MAP.x1 - MAP.x0), mapC.height / (MAP.z1 - MAP.z0));
const mx = (x) => (x - MAP.x0) * ms + (mapC.width - (MAP.x1 - MAP.x0) * ms) / 2;
const mz = (z) => (z - MAP.z0) * ms;
const mapBg = document.createElement("canvas"); mapBg.width = mapC.width; mapBg.height = mapC.height;
{
  const g = mapBg.getContext("2d");
  g.fillStyle = "#e7ecef"; g.fillRect(0, 0, mapBg.width, mapBg.height);
  g.fillStyle = "#c8d3c0"; g.fillRect(0, mz(8.5), mapBg.width, mz(13.6) - mz(8.5));
  g.fillStyle = "#f7f6f2"; g.fillRect(mx(-12), mz(-8), 24 * ms, 16 * ms);
  for (const [k, z] of Object.entries(ZONES)) {
    const [x0, z0, x1, z1] = z.rect;
    g.fillStyle = z.color + "33"; g.fillRect(mx(x0), mz(z0), (x1 - x0) * ms, (z1 - z0) * ms);
    g.fillStyle = z.color; g.font = "bold 22px sans-serif"; g.fillText(k, mx(x0) + 5, mz(z0) + 22);
  }
  g.fillStyle = "#7d858e";
  for (const [cx, cz] of [[0, -7.5], [4.4, -7.5], [0, -4.6], [4.4, -4.6]]) g.fillRect(mx(cx - 1.8), mz(cz - 0.22), 3.6 * ms, 0.45 * ms);
  g.fillRect(mx(7.7), mz(-7.6), 3.6 * ms, 1.2 * ms);
  g.fillStyle = "#94a3b8";
  g.fillRect(mx(8.3), mz(2.2), 0.6 * ms, 3.6 * ms); g.fillRect(mx(-8.7), mz(3.1), 0.6 * ms, 3 * ms);
  g.fillRect(mx(-9.7), mz(-5.65), 2.4 * ms, 0.9 * ms); g.fillRect(mx(-11.85), mz(3.3), 0.8 * ms, 2.6 * ms);
  g.fillStyle = "#0f7f86"; g.fillRect(mx(3.0), mz(12.0), 5 * ms, 0.6 * ms);
  g.fillStyle = "#1f2a3a"; g.font = "16px sans-serif"; g.fillText("智能柜", mx(3.4), mz(12.0) - 4);
  g.fillText("自助终端", mx(5.4), mz(7.3) - 2);
  g.strokeStyle = "#243447"; g.lineWidth = 4; g.beginPath();
  g.moveTo(mx(-1.2), mz(8)); g.lineTo(mx(-12), mz(8)); g.lineTo(mx(-12), mz(-8)); g.lineTo(mx(-10), mz(-8));
  g.moveTo(mx(-7), mz(-8)); g.lineTo(mx(12), mz(-8)); g.lineTo(mx(12), mz(8)); g.lineTo(mx(1.2), mz(8)); g.stroke();
  g.strokeStyle = "#6b7280"; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(mx(-10), mz(-8)); g.lineTo(mx(-7), mz(-8)); g.stroke(); g.setLineDash([]);
}
let highlightZone = null;
function drawMap(t) {
  mg.drawImage(mapBg, 0, 0);
  if (highlightZone) {
    const z = ZONES[highlightZone], [x0, z0, x1, z1] = z.rect;
    mg.strokeStyle = z.color; mg.lineWidth = 4 + Math.sin(t * 6) * 2; mg.strokeRect(mx(x0), mz(z0), (x1 - x0) * ms, (z1 - z0) * ms);
  }
  for (const p of people) { mg.fillStyle = p === mentor ? "#0f7f86" : "#8a94a3"; mg.beginPath(); mg.arc(mx(p.g.position.x), mz(p.g.position.z), 4, 0, 7); mg.fill(); }
  if (beaconTarget) { mg.strokeStyle = "#2f6fed"; mg.lineWidth = 3; mg.beginPath(); mg.arc(mx(beaconTarget[0]), mz(beaconTarget[1]), 8 + Math.sin(t * 6) * 3, 0, 7); mg.stroke(); }
  mg.save(); mg.translate(mx(P.x), mz(P.z)); mg.rotate(-P.yaw);
  mg.fillStyle = "rgba(47,111,237,.18)"; mg.beginPath(); mg.moveTo(0, 0); mg.arc(0, 0, 40, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); mg.fill();
  mg.fillStyle = "#2f6fed"; mg.strokeStyle = "#fff"; mg.lineWidth = 2; mg.beginPath(); mg.moveTo(0, -10); mg.lineTo(7, 7); mg.lineTo(0, 3); mg.lineTo(-7, 7); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
}
mapC.addEventListener("click", (e) => {
  if (P.mode !== "free" && P.mode !== "auto") return toast("正在操作设备，完成当前步骤后可自由走动");
  const r = mapC.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * mapC.width, y = ((e.clientY - r.top) / r.height) * mapC.height;
  const wx = (x - (mapC.width - (MAP.x1 - MAP.x0) * ms) / 2) / ms + MAP.x0, wz = y / ms + MAP.z0;
  walkTo(wx, wz);
});

// ---------- PDA 手持 ----------
const pda = W.dev.pda;
const pdaHome = { p: pda.g.position.clone(), r: pda.g.rotation.clone() };
let holding = false;
function holdPDA(on) {
  holding = on;
  if (on) {
    camera.add(pda.g); pda.g.position.set(0.15, -0.17, -0.34); pda.g.rotation.set(-1.0, -0.25, -0.12);
    pda.g.traverse((m) => (m.castShadow = false));
  } else {
    scene.add(pda.g); pda.g.position.copy(pdaHome.p); pda.g.rotation.copy(pdaHome.r);
  }
}
function pdaDraw(lines, head = "驿站 PDA") {
  pda.screen.draw((g, w, h) => {
    g.fillStyle = "#eef3f8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1d4ed8"; g.fillRect(0, 0, w, 44);
    g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.fillText(head, 10, 30);
    let y = 76;
    for (const l of lines) {
      const big = l.startsWith("#");
      g.fillStyle = l.startsWith("!") ? "#c62828" : big ? "#0b1f4d" : "#334155";
      g.font = big ? "bold 26px sans-serif" : "20px sans-serif";
      g.fillText(l.replace(/^[#!]/, ""), 10, y); y += big ? 36 : 30;
    }
  });
}
pdaDraw(["#待机", "请登录工号"]);
async function scanFx(ok) {
  if (!holding) return;
  pda.laser.material.opacity = 0.55;
  await wait(260);
  pda.laser.material.opacity = 0;
  beep(ok);
}

// ---------- 时间 ----------
function setTime(h) {
  W.setTime(h);
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  $("#clock").textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// ---------- 主循环 ----------
const clock = new THREE.Timer();
clock.connect?.(document);
let slow = 0, quality = composer ? 3 : 2, fpsT = 0, fpsN = 0, elapsed = 0;
const fwd = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
  clock.update(now);
  const dt = Math.min(0.08, clock.getDelta()) * G.timeScale;
  elapsed += dt;
  // 帧率自适应：先降分辨率，再关阴影
  fpsT += dt; fpsN++;
  if (fpsT > 2.5) {
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (fps < 26 && quality > 0 && !overlay.open) {
      if (++slow >= 2) {
        slow = 0; quality--;
        if (quality === 2) dropComposer();
        if (quality === 1) { pixelRatio = 1; renderer.setPixelRatio(1); resize(); }
        if (quality === 0) { W.lights.sun.castShadow = false; renderer.shadowMap.enabled = false; scene.traverse((o) => o.material && (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true))); }
      }
    } else slow = 0;
  }
  // 玩家
  if (P.mode === "fly" && P.fly) {
    const f = P.fly; f.t += dt / f.dur;
    const k = f.t >= 1 ? 1 : 1 - Math.pow(1 - f.t, 3);
    for (const key of ["x", "z", "eye", "yaw", "pitch"]) P[key] = f.from[key] + (f.to[key] - f.from[key]) * k;
    if (f.t >= 1) { P.fly = null; P.mode = "locked"; f.res(); }
  } else if (P.mode === "free" || P.mode === "auto") {
    let mxv = 0, mzv = 0;
    if (!overlay.open) {
      if (keys.has("KeyW") || keys.has("ArrowUp")) mzv += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) mzv -= 1;
      if (keys.has("KeyA")) mxv -= 1;
      if (keys.has("KeyD")) mxv += 1;
      if (keys.has("ArrowLeft") || keys.has("KeyQ")) P.yaw += dt * 1.8;
      if (keys.has("ArrowRight") || keys.has("KeyE")) P.yaw -= dt * 1.8;
    }
    const sp = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4.2 : 2.4) * dt;
    if (mxv || mzv) {
      P.mode = "free"; P.path = null;
      const l = Math.hypot(mxv, mzv);
      const vx = (-Math.sin(P.yaw) * mzv + Math.cos(P.yaw) * mxv) / l * sp, vz = (-Math.cos(P.yaw) * mzv - Math.sin(P.yaw) * mxv) / l * sp;
      if (W.grid.free(P.x + vx, P.z)) P.x += vx;
      if (W.grid.free(P.x, P.z + vz)) P.z += vz;
    } else if (P.mode === "auto" && P.path && P.path.length) {
      const [tx, tz] = P.path[0], dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
      if (d < 0.08) { P.path.shift(); if (!P.path.length) { P.path = null; P.mode = "free"; } }
      else {
        const st = Math.min(d, 2.6 * dt);
        P.x += (dx / d) * st; P.z += (dz / d) * st;
        if (!down) { let dy = Math.atan2(-dx, -dz) - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy * Math.min(1, dt * 5); P.pitch += (-0.08 - P.pitch) * Math.min(1, dt * 3); }
      }
    } else if (P.mode === "auto") P.mode = "free";
    P.eye += (EYE - P.eye) * Math.min(1, dt * 4);
  }
  if (P.mode === "locked" && !overlay.open) {
    if (keys.has("ArrowLeft") || keys.has("KeyQ")) P.yaw += dt * 1.8;
    if (keys.has("ArrowRight") || keys.has("KeyE")) P.yaw -= dt * 1.8;
  }
  camera.position.set(P.x, P.eye + (P.mode === "auto" || ((P.mode === "free") && (keys.size > 0)) ? Math.sin(elapsed * 9) * 0.012 : 0), P.z);
  camera.rotation.set(P.pitch, P.yaw, 0, "YXZ");

  // 条件等待、补间动画
  for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].cond()) { const w = waiters.splice(i, 1)[0]; w.res(); }
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  // 感应门
  let near = Math.hypot(P.x, P.z - 8.1) < 2.4;
  for (const p of people) if (Math.hypot(p.g.position.x, p.g.position.z - 8.1) < 2.2) near = true;
  W.doors.open += ((near ? 1 : 0) - W.doors.open) * Math.min(1, dt * 4);
  W.doors.L.position.x = -0.6 - W.doors.open * 1.1; W.doors.R.position.x = 0.6 + W.doors.open * 1.1;
  // 卷帘门、车门
  const ro = W.roller; ro.open += (ro.target - ro.open) * Math.min(1, dt * 1.2);
  ro.panel.scale.y = 1 - ro.open * 0.94; ro.panel.position.y = -1.5 * (1 - ro.open * 0.94);
  const van = W.van; van.open += (van.target - van.open) * Math.min(1, dt * 2);
  for (const d of van.doors) d.pv.rotation.y = d.s * van.open * 1.75;
  // 人物
  for (const p of people) p.update(dt);
  for (const p of walkers) if (!p.path) { p.dir *= -1; p.path = [new THREE.Vector2(p.dir * 35, p.g.position.z)]; }
  // 场景动效
  for (const a of W.anim) a(dt, elapsed);
  hlPulse(elapsed);
  if (beacon.visible) {
    beacon.userData.arrow.position.y = 1.9 + Math.sin(elapsed * 3) * 0.12; beacon.userData.arrow.rotation.y += dt * 2;
    beacon.userData.ring.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.08);
  }
  if ((hoverFrame = (hoverFrame + 1) % 3) === 0) {
    if (isLocked() && needsCursor()) document.exitPointerLock();
    updateHover();
  }
  if (hoverFrame === 1) drawMap(elapsed);
  camera.getWorldDirection(fwd);
  if (composer) composer.render(dt); else renderer.render(scene, camera);
});

// ---------- 给任务脚本用的接口 ----------
const G = {
  W, P, scene, camera, renderer, people, mentor, timeScale: 1,
  until, tween, wait, flyTo, walkTo, release, clickOn, hl, setBeacon, clearBeacon, spawn, despawn, holdPDA, pdaDraw, scanFx, setTime,
  addPick(o) { dyn.add(o); }, removePick(o) { dyn.delete(o); hl(o, false); },
  get holding() { return holding; },
  setZone(z) { highlightZone = z; },
  cancelClick() { if (clickWait) { clickWait.targets.forEach((o) => typeof o !== "function" && hl(o, false)); clickWait = null; } },
  dist(x, z) { return Math.hypot(P.x - x, P.z - z); },
  // 前往某个站位：远了就显示指示标和“自动前往”，到了以后镜头移到操作机位
  async goto(st, text) {
    if (st.stand && G.dist(st.stand[0], st.stand[1]) > 1.1) {
      release();
      setBeacon(st.stand[0], st.stand[1]);
      panel.instr((text || `前往 <b>${st.name}</b>`) + `<span class="tip">跟着地面蓝色光圈走（小地图上也有标记），或点「自动前往」。</span>`);
      panel.btns([{ label: "自动前往", primary: true, soft: true, fn: () => walkTo(st.stand[0], st.stand[1]) }]);
      await until(() => G.dist(st.stand[0], st.stand[1]) < 0.9);
      clearBeacon(); panel.btns([]); panel.instr("");
    }
    if (st.eye) await flyTo(st);
  },
  onDevice: (k) => showDex(k),
  // 自动化测试用：直接“点中”当前等待的第 i 个目标
  testPick(i = 0) {
    if (!clickWait) return false;
    const t = clickWait.targets.filter((o) => typeof o !== "function")[i];
    if (!t) return false;
    const cw = clickWait; clickWait = null; cw.targets.forEach((o) => typeof o !== "function" && hl(o, false)); cw.res({ target: t, hit: null });
    return true;
  },
  get waitingClick() { return !!clickWait; },
  get beaconTarget() { return beaconTarget; },
  seenDev: new Set(),
  devHook: null,
};
// 点设备 → 右侧显示设备卡片
function showDex(k) {
  const d = DEVICES.find((x) => x.key === k);
  if (!d) return;
  G.seenDev.add(k);
  if (G.devHook && G.devHook(k)) return;
  if (device.busy()) { toast(d.name + "：" + d.use); return; }
  device.show("plain", d.name, `<b>作用：</b>${d.use}<br><b>标准操作：</b><ol style="margin:4px 0;padding-left:18px">${d.steps.map((s) => `<li>${s}</li>`).join("")}</ol><b style="color:#d64545">常见错误：</b><ul style="margin:4px 0;padding-left:18px">${d.errors.map((s) => `<li>${s}</li>`).join("")}</ul>`, [{ act: "close", label: "关闭", cls: "wide" }], { tag: "作业区 " + d.zone, dex: true });
  device.wait().then(() => device.hide());
}

setTime(7.83);
initTasks(G);
