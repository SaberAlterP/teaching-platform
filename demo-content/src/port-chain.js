// 集装箱码头换装链 3D：海铁换装 / 进口 / 出口三条流程动画（岸桥—集卡—场桥—堆场—闸口—门吊—铁路平车）+ 练习（排序、小题、集卡配置）
// 构建：npm run demo:build  → demo-content/dist/码头换装链-3D.html（单文件，可直接上传到平台）
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------- 小工具 ----------
const $ = (id) => document.getElementById(id);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, k) => a + (b - a) * k;
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIn = (k) => k * k;
const linear = (k) => k;
let seed = 20260928;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

// 集装箱（40 尺）外尺寸，单位米
const CL = 12.19, CW = 2.44, CH = 2.59;
const DECK = 1.35; // 集卡板车承箱面高度
const TRUCK_TOP = DECK + CH;
const WATER_Y = -2.2;
const QUAY = -9.5; // 码头前沿线
const SHIP_Z = -24; // 船中心线
const SHIP_DECK = 3.8; // 舱盖板顶面
const shipRowZ = (r) => (r - 4.5) * 2.5; // 船上第 r 列（0..9，9 靠码头）相对船中心的 z
const shipY = (tier) => SHIP_DECK + tier * CH + CH / 2;
const yardY = (tier) => tier * CH + CH / 2;
const YA = 70; // 堆场 A 区中心 z（场桥跨度中心）
const YB = 100;
const LANE_A = 61;

// ---------- 调度（可暂停、可取消的补间） ----------
const CANCEL = { cancel: true };
class Clock {
  constructor() { this.t = 0; this.jobs = []; }
  tick(dt) {
    this.t += dt;
    const jobs = this.jobs;
    this.jobs = [];
    for (const j of jobs) {
      if (j.cond) {
        if (j.cond()) j.res(); else this.jobs.push(j);
        continue;
      }
      const k = Math.min(1, (this.t - j.t0) / j.dur);
      if (j.fn) j.fn(j.ease(k));
      if (k >= 1) j.res(); else this.jobs.push(j);
    }
  }
  tween(dur, fn, ease = easeIO) {
    return new Promise((res, rej) => {
      this.jobs.push({ t0: this.t, dur: Math.max(dur, 1e-4), fn, ease, res, rej });
      if (fn) fn(0);
    });
  }
  wait(d) { return this.tween(d, null); }
  until(cond) { return new Promise((res, rej) => this.jobs.push({ cond, res, rej })); }
  cancel() {
    const jobs = this.jobs;
    this.jobs = [];
    for (const j of jobs) j.rej(CANCEL);
  }
}
const main = new Clock(); // 流程动画
const amb = new Clock(); // 环境动效
const quiet = (p) => p.catch((e) => { if (e !== CANCEL) console.error(e); });

// ---------- 渲染器 / 场景 ----------
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const HORIZON = 0xdde9f2;
scene.background = new THREE.Color(HORIZON);
scene.fog = new THREE.Fog(HORIZON, 280, 950);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 8;
controls.maxDistance = 560;

scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8d9288, 1.2));
const sun = new THREE.DirectionalLight(0xfff5e6, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 10, far: 520 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);
const SUN_OFF = V3(110, 190, 80);

// 天空穹顶
const sky = (() => {
  const g = new THREE.SphereGeometry(2000, 32, 16);
  const top = new THREE.Color(0x6aa3d8), hor = new THREE.Color(HORIZON);
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const c = hor.clone().lerp(top, Math.pow(Math.max(0, p.getY(i) / 2000), 0.55));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  scene.add(m);
  return m;
})();

// ---------- 建模工具：同类部件合并成一个网格，并自动描边 ----------
const MATS = {
  std: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.45 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.6 }),
  rubber: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  flat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
};
const LINE = new THREE.LineBasicMaterial({ color: 0x1a2230, transparent: true, opacity: 0.6 });
const LINE_SOFT = new THREE.LineBasicMaterial({ color: 0x1a2230, transparent: true, opacity: 0.35 });
const GC = new Map();
const cached = (key, make) => {
  if (!GC.has(key)) GC.set(key, make());
  return GC.get(key);
};
const BOX = (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const CYL = (rt, rb, h, s = 16) => cached(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const EC = new Map();
function edgesOf(geo, thr) {
  const k = geo.uuid + ":" + thr;
  if (!EC.has(k)) EC.set(k, new THREE.EdgesGeometry(geo, thr));
  return EC.get(k);
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V3(1, 1, 1), _p = V3();
const UP = V3(0, 1, 0);
class Kit {
  constructor() { this.parts = new Map(); this.lines = []; this.raw = []; }
  add(geo, color, x = 0, y = 0, z = 0, o = {}) {
    const q = o.q || _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0));
    _m4.compose(_p.set(x, y, z), q, o.s ? _s.set(o.s[0], o.s[1], o.s[2]) : _s.set(1, 1, 1));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.clearGroups();
    g.applyMatrix4(_m4);
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    const cls = o.cls || "std";
    if (!this.parts.has(cls)) this.parts.set(cls, []);
    this.parts.get(cls).push(g);
    if (o.edge !== false) {
      const e = edgesOf(geo, o.thr ?? 30).clone();
      e.applyMatrix4(_m4);
      this.lines.push(e);
    }
    return this;
  }
  // 两点之间的杆件（方钢或圆管）
  beam(a, b, w, color, o = {}) {
    const dir = b.clone().sub(a), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const L = Math.round(len * 100) / 100;
    const geo = o.round ? CYL(w / 2, w / 2, L, o.seg || 8) : BOX(w, L, w);
    return this.add(geo, color, mid.x, mid.y, mid.z, { thr: o.round ? 40 : 30, ...o, q });
  }
  seg(a, b) { this.raw.push(a.x, a.y, a.z, b.x, b.y, b.z); return this; }
  build(parent, o = {}) {
    for (const [cls, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list), MATS[cls]);
      m.castShadow = o.cast !== false && cls !== "glow";
      m.receiveShadow = o.receive !== false;
      parent.add(m);
    }
    const ls = [...this.lines];
    if (this.raw.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.raw, 3));
      ls.push(g);
    }
    if (ls.length) parent.add(new THREE.LineSegments(mergeGeometries(ls), o.line || LINE));
    return parent;
  }
}

// ---------- 贴图 ----------
function cvs(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function toTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}
// 文字牌
function signMesh(w, h, draw, o = {}) {
  const ppm = o.ppm || 64;
  const [c, g] = cvs(Math.round(w * ppm), Math.round(h * ppm));
  draw(g, c.width, c.height);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: toTex(c), transparent: !!o.transparent, roughness: 0.7, side: o.double ? THREE.DoubleSide : THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  return m;
}
function textFill(g, txt, x, y, px, color, o = {}) {
  g.font = `${o.weight || 700} ${px}px ${o.font || FONT}`;
  g.fillStyle = color;
  g.textAlign = o.align || "center";
  g.textBaseline = "middle";
  if (o.maxW) {
    const m = g.measureText(txt).width;
    if (m > o.maxW) g.font = `${o.weight || 700} ${Math.floor((px * o.maxW) / m)}px ${o.font || FONT}`;
  }
  g.fillText(txt, x, y);
}

// 集装箱贴图：灰底，由实例颜色 / 材质颜色染色
const TEXC = {};
function sideTex(brand, num) {
  const key = "s" + brand + num;
  if (TEXC[key]) return TEXC[key];
  const [c, g] = cvs(512, 110);
  g.fillStyle = "#c9c9c9";
  g.fillRect(0, 0, 512, 110);
  const n = 48, p = 512 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? "#b7b7b7" : "#d8d8d8";
    g.fillRect(i * p, 7, p, 96);
    g.fillStyle = "rgba(0,0,0,.14)";
    g.fillRect(i * p, 7, 1, 96);
  }
  g.fillStyle = "#9c9c9c";
  g.fillRect(0, 0, 512, 7);
  g.fillRect(0, 103, 512, 7);
  g.fillStyle = "#a9a9a9";
  g.fillRect(0, 0, 10, 110);
  g.fillRect(502, 0, 10, 110);
  g.fillStyle = "#7a7a7a";
  for (const [x, y] of [[0, 0], [0, 99], [499, 0], [499, 99]]) g.fillRect(x, y, 13, 11);
  if (brand) textFill(g, brand, 256, 55, 36, "rgba(255,255,255,.95)", { font: "Arial Black, Arial, sans-serif", weight: 900 });
  if (num) textFill(g, num, 490, 22, 13, "#ffffff", { font: "Arial, sans-serif", align: "right", weight: 700 });
  g.strokeStyle = "#262626";
  g.lineWidth = 2.5;
  g.strokeRect(1.25, 1.25, 509.5, 107.5);
  return (TEXC[key] = toTex(c));
}
function endTex(num) {
  const key = "e" + num;
  if (TEXC[key]) return TEXC[key];
  const [c, g] = cvs(128, 124);
  g.fillStyle = "#c4c4c4";
  g.fillRect(0, 0, 128, 124);
  for (let y = 12; y < 112; y += 10) {
    g.fillStyle = "rgba(0,0,0,.06)";
    g.fillRect(8, y, 112, 4);
  }
  g.fillStyle = "#9a9a9a";
  g.fillRect(0, 0, 128, 7);
  g.fillRect(0, 117, 128, 7);
  g.fillRect(0, 0, 7, 124);
  g.fillRect(121, 0, 7, 124);
  g.fillStyle = "#555";
  g.fillRect(63, 7, 2, 110);
  // 锁杆与把手
  for (const x of [22, 44, 84, 106]) {
    g.fillStyle = "#6b6b6b";
    g.fillRect(x - 1.5, 8, 3, 108);
    g.fillStyle = "#4b4b4b";
    g.fillRect(x - 5, 62, 10, 4);
  }
  g.fillStyle = "#777";
  for (const y of [18, 44, 76, 102]) {
    g.fillRect(4, y, 8, 6);
    g.fillRect(116, y, 8, 6);
  }
  if (num) textFill(g, num, 96, 24, 10, "#ffffff", { font: "Arial, sans-serif", weight: 700 });
  g.strokeStyle = "#262626";
  g.lineWidth = 2.5;
  g.strokeRect(1.25, 1.25, 125.5, 121.5);
  return (TEXC[key] = toTex(c));
}
function topTex() {
  if (TEXC.top) return TEXC.top;
  const [c, g] = cvs(512, 104);
  g.fillStyle = "#c0c0c0";
  g.fillRect(0, 0, 512, 104);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = i % 2 ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.08)";
    g.fillRect(8 + i * 12.4, 6, 12.4, 92);
  }
  g.fillStyle = "#7a7a7a";
  for (const [x, y] of [[0, 0], [0, 94], [498, 0], [498, 94]]) g.fillRect(x, y, 14, 10);
  g.strokeStyle = "#262626";
  g.lineWidth = 2.5;
  g.strokeRect(1.25, 1.25, 509.5, 101.5);
  return (TEXC.top = toTex(c));
}
const CGEO = new THREE.BoxGeometry(CL, CH, CW);
const CEDGE = new THREE.EdgesGeometry(CGEO);
const matCache = {};
function boxMats(color, brand = "", num = "") {
  const key = color + brand + num;
  if (matCache[key]) return matCache[key];
  const m = (map) => new THREE.MeshStandardMaterial({ color, map, roughness: 0.72, metalness: 0.08 });
  const end = m(endTex(num)), top = m(topTex()), side = m(sideTex(brand, num));
  // BoxGeometry 面顺序：+x, -x, +y, -y, +z, -z
  return (matCache[key] = [end, end, top, top, side, side]);
}
const BRANDS = ["HAIYUN", "OCEANIX"];
const PALETTE = [0xc0473b, 0x3565a8, 0x3f8a5c, 0xaab2bb, 0xe0913d, 0x2f9095, 0x843444, 0xd9b84e, 0xeceae4, 0x2d4677, 0x9a6a3c];
function makeBox(color, brand, num) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(CGEO, boxMats(color, brand, num));
  m.castShadow = m.receiveShadow = true;
  g.add(m, new THREE.LineSegments(CEDGE, LINE));
  scene.add(g);
  return g;
}
// 静态箱垛：实例化网格 + 合并描边
function buildStacks(parent, list) {
  const tmp = new THREE.Matrix4();
  BRANDS.forEach((b, bi) => {
    const items = list.filter((it) => it.brand === bi);
    if (!items.length) return;
    const im = new THREE.InstancedMesh(CGEO, boxMats(0xffffff, b), items.length);
    items.forEach((it, i) => {
      tmp.makeTranslation(it.x, it.y, it.z);
      im.setMatrixAt(i, tmp);
      im.setColorAt(i, new THREE.Color(it.color));
    });
    im.castShadow = im.receiveShadow = true;
    parent.add(im);
  });
  const eds = list.map((it) => CEDGE.clone().translate(it.x, it.y, it.z));
  parent.add(new THREE.LineSegments(mergeGeometries(eds), LINE_SOFT));
}
const pickColor = () => PALETTE[Math.floor(rnd() * PALETTE.length)];
const pickBrand = () => (rnd() < 0.5 ? 0 : 1);

// ISO 6346 箱号校验码
function checkDigit(code10) {
  const val = (ch) => {
    if (/\d/.test(ch)) return +ch;
    let v = ch.charCodeAt(0) - 55; // A=10
    return v + Math.floor((v - 1) / 10); // 跳过 11 的倍数
  };
  let s = 0;
  for (let i = 0; i < 10; i++) s += val(code10[i]) * 2 ** i;
  return (s % 11) % 10;
}
const IMP_NO = "HYCU260928", EXP_NO = "OCXU518203";
const IMP_NUM = `${IMP_NO.slice(0, 4)} ${IMP_NO.slice(4)} ${checkDigit(IMP_NO)}`;
const EXP_NUM = `${EXP_NO.slice(0, 4)} ${EXP_NO.slice(4)} ${checkDigit(EXP_NO)}`;

// ---------- 可点击设备说明 ----------
const INFO = {
  sts: ["岸桥（岸边集装箱起重机）", "沿码头前沿的轨道行走，小车在臂架上前后移动、吊具升降，负责船舶的装船和卸船，是整个作业链的“节拍器”。常见效率每小时 25–35 自然箱。本模型：轨距 30 米，外伸距约 45 米。"],
  rtg: ["场桥（轮胎式龙门起重机，RTG）", "横跨 6 排箱子和 1 条集卡车道，一般堆 4–5 层高。负责堆场里的收箱（从集卡卸下堆存）、发箱（装上集卡）和翻箱。"],
  itruck: ["内集卡（码头内部集卡）", "只在港区内部行驶，在码头前沿的岸桥和堆场的场桥之间来回运箱，这段运输叫“水平运输”。"],
  etruck: ["外集卡（社会集卡）", "负责港外的运输：把出口箱从工厂、货代场站运进港，把进口箱从港里提出去送给收货人。进出港都要过闸口。"],
  ship: ["集装箱船", "箱子按“贝位—排—层”三个编号存放在舱内和甲板上。靠泊后由岸桥卸下进口箱、装上出口箱。本船：船长约 150 米，甲板上 8 个 40 尺贝位。"],
  gate: ["闸口", "港区的“大门”。进出港的集卡在这里接受检查：车牌和箱号识别、核对预约和单证、检查箱体和铅封、过磅称重，全部通过后抬杆放行。"],
  yard: ["堆场", "集装箱在港区内临时存放的场地，一般分为进口箱区、出口箱区、空箱区、冷藏箱区等。每个箱位用“箱区—贝—排—层”表示。"],
  cfs: ["集装箱货运站（CFS）", "拼箱货在这里拆箱、装箱和分拨：多个货主的小批量货物拼成一个整箱出口，或把进口拼箱拆开分给各个收货人。"],
  office: ["码头操作中心", "码头操作系统（TOS）在这里运行：制定船舶配载和堆场计划，给岸桥、场桥、集卡派发作业指令，监控整个作业链。"],
  rmg: ["铁路门吊（轨道式龙门起重机）", "跨在铁路装卸线和集卡车道上方，沿地面轨道行走，把集装箱从集卡吊到铁路平车上（或反过来）。没有门吊的场站，常用机动灵活的正面吊装卸火车。"],
  train: ["集装箱班列（铁路平车）", "专门装运集装箱的铁路平车，车面有锁头（旋锁座）固定箱子四个角。一列班列可以装几十个箱子，按固定时刻发车，是海铁联运的“干线”。"],
  impBox: ["海铁联运箱 / 进口箱 " + IMP_NUM, "40 尺普通干货箱（箱型代码 45G1）。箱号由 4 个字母（箱主代码 + U）、6 位序号和 1 位校验码组成，校验码可以防止抄错箱号。"],
  expBox: ["出口箱 " + EXP_NUM, "40 尺普通干货箱（箱型代码 45G1），装好货、施加铅封后由外集卡运进港区，等待装船出口。"],
};
const pickables = [];
function pickable(obj, key) {
  obj.userData.info = key;
  pickables.push(obj);
}

// ---------- 地面、海面、码头 ----------
const world = new THREE.Group();
scene.add(world);
const stripes = { white: [], yellow: [] };
// 地面标线：在 (x1,z1)-(x2,z2) 之间画一条宽 w 的线
function stripe(x1, z1, x2, z2, w = 0.18, col = "white") {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  const g = new THREE.PlaneGeometry(len, w);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.atan2(-dz, dx));
  g.translate((x1 + x2) / 2, 0.03, (z1 + z2) / 2);
  stripes[col].push(g);
}
function dashed(x1, z1, x2, z2, dash = 3, gap = 3, w = 0.18, col = "white") {
  const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / (dash + gap));
  for (let i = 0; i <= n; i++) {
    const a = (i * (dash + gap)) / len, b = Math.min(1, (i * (dash + gap) + dash) / len);
    if (a >= 1) break;
    stripe(lerp(x1, x2, a), lerp(z1, z2, a), lerp(x1, x2, b), lerp(z1, z2, b), w, col);
  }
}
{
  // 沥青地面（带细微颗粒）
  const [c, g] = cvs(256, 256);
  g.fillStyle = "#8e959d";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.floor(rnd() * 50);
    g.fillStyle = `rgba(${v},${v + 4},${v + 8},.35)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 520), new THREE.MeshStandardMaterial({ map: toTex(c, [150, 52]), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, QUAY + 260);
  ground.receiveShadow = true;
  world.add(ground);
  // 码头前沿混凝土（带伸缩缝）
  const [c2, g2] = cvs(256, 256);
  g2.fillStyle = "#b9bdc3";
  g2.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    g2.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.06)";
    g2.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  g2.strokeStyle = "rgba(60,64,70,.35)";
  g2.lineWidth = 2;
  g2.strokeRect(0, 0, 256, 256);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(900, 52), new THREE.MeshStandardMaterial({ map: toTex(c2, [90, 5.2]), roughness: 0.9 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0.01, QUAY + 26);
  apron.receiveShadow = true;
  world.add(apron);
  // 闸口外道路（颜色更深）
  const road = new THREE.Mesh(new THREE.PlaneGeometry(30, 200), new THREE.MeshStandardMaterial({ color: 0x6f757c, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(90, 0.012, 262);
  road.receiveShadow = true;
  world.add(road);
}
// 海面：低多边形起伏（环境动效开启时波动）
const water = (() => {
  const g = new THREE.PlaneGeometry(1600, 700, 80, 35);
  g.rotateX(-Math.PI / 2);
  g.translate(0, WATER_Y, QUAY - 350);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2f7196, roughness: 0.35, metalness: 0.15, flatShading: true }));
  m.receiveShadow = true;
  world.add(m);
  m.userData.base = Float32Array.from(g.attributes.position.array);
  return m;
})();
{
  const k = new Kit();
  // 码头岸壁、前沿护轮坎
  k.add(BOX(900, 9, 2), 0xa9aeb5, 0, -4.5, QUAY + 1, { edge: false });
  k.add(BOX(900, 0.3, 0.45), 0xe3b52c, 0, 0.15, QUAY + 0.3, { edge: false });
  for (let x = -440; x <= 440; x += 16) {
    // 橡胶护舷
    k.add(BOX(1.6, 3.2, 0.9), 0x23262b, x, -1.4, QUAY - 0.45, { cls: "rubber" });
    k.add(BOX(2.6, 3.8, 0.25), 0x3a3f46, x, -1.4, QUAY - 1.0);
    // 系船柱
    k.add(CYL(0.3, 0.36, 0.7, 12), 0x30353c, x + 8, 0.35, QUAY + 1.2, { cls: "metal", thr: 40 });
    k.add(CYL(0.46, 0.46, 0.14, 12), 0x30353c, x + 8, 0.75, QUAY + 1.2, { cls: "metal", thr: 40 });
  }
  // 岸桥轨道
  for (const z of [-3, 27]) {
    k.add(BOX(900, 0.14, 0.32), 0x59606a, 0, 0.08, z, { cls: "metal" });
    k.add(BOX(900, 0.02, 1.4), 0x7e848c, 0, 0.02, z, { edge: false });
  }
  k.build(world);
  // 标线：岸桥下车道、安全线
  stripe(-450, QUAY + 1.2, 450, QUAY + 1.2, 0.25, "yellow");
  for (const z of [6, 14, 22]) dashed(-450, z, 450, z, 4, 4);
  for (const z of [2, 26]) stripe(-450, z, 450, z, 0.2);
  // 远山
  const hills = new Kit();
  for (let i = 0; i < 16; i++) {
    const x = -700 + i * 95 + rnd() * 40, h = 40 + rnd() * 70, r = 90 + rnd() * 60;
    hills.add(new THREE.ConeGeometry(r, h, 7), i % 2 ? 0x8fa6a0 : 0x9cb1aa, x, h / 2 - 3, -640 - rnd() * 60, { cls: "flat", edge: false });
    hills.add(new THREE.ConeGeometry(r * 0.8, h * 0.8, 6), 0xa2b3a4, x + 40, (h * 0.8) / 2, 560 + rnd() * 60, { cls: "flat", edge: false });
  }
  hills.build(world, { cast: false });
}

// ---------- 路径（集卡行驶路线） ----------
class Path {
  constructor(pts, r = 9) {
    const P = pts.map(([x, z]) => V3(x, 0, z));
    const cp = new THREE.CurvePath();
    let cur = P[0];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const rr = Math.min(r, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
      const pin = b.clone().add(a.clone().sub(b).setLength(rr));
      const pout = b.clone().add(c.clone().sub(b).setLength(rr));
      if (cur.distanceTo(pin) > 1e-3) cp.add(new THREE.LineCurve3(cur.clone(), pin));
      cp.add(new THREE.QuadraticBezierCurve3(pin, b.clone(), pout));
      cur = pout;
    }
    cp.add(new THREE.LineCurve3(cur.clone(), P[P.length - 1]));
    this.c = cp;
    this.L = cp.getLength();
    this.p0 = P[0];
    this.t0 = P[1].clone().sub(P[0]).normalize();
    this.p1 = P[P.length - 1];
    this.t1 = P[P.length - 1].clone().sub(P[P.length - 2]).normalize();
  }
  at(d, out = V3()) {
    if (d <= 0) return out.copy(this.p0).addScaledVector(this.t0, d);
    if (d >= this.L) return out.copy(this.p1).addScaledVector(this.t1, d - this.L);
    return this.c.getPoint(d / this.L, out);
  }
}
const P = {
  itWait: new Path([[-40, 10], [0, 10]]),
  itToYard: new Path([[0, 10], [72, 10], [72, LANE_A], [0, LANE_A]]),
  itLeave: new Path([[0, LANE_A], [-72, LANE_A], [-72, 30]]),
  etIn: new Path([[86, 262], [86, 154]]),
  etToYard: new Path([[86, 154], [86, LANE_A], [0, LANE_A]], 10),
  etToOut: new Path([[0, LANE_A], [-72, LANE_A], [-72, 125], [94, 125], [94, 146]], 10),
  etOut: new Path([[94, 146], [94, 280]]),
  itArrive: new Path([[72, 16], [72, LANE_A], [0, LANE_A]]),
  itToQuay: new Path([[0, LANE_A], [-72, LANE_A], [-72, 10], [0, 10]]),
  toRail: new Path([[0, LANE_A], [-96, LANE_A], [-104, 69], [-150, 69]], 6),
  railLeave: new Path([[-150, 69], [-240, 69]]),
  ambLoop: new Path([[0, 91], [64, 91], [64, 116], [-64, 116], [-64, 91], [0, 91]], 8),
};
// 路面车道边线
function laneEdges(path, off = 2.2, step = 6) {
  const a = V3(), b = V3(), n = V3();
  for (let d = 0; d < path.L - 2; d += step) {
    path.at(d, a);
    path.at(Math.min(d + 3, path.L), b);
    n.set(-(b.z - a.z), 0, b.x - a.x).normalize();
    for (const s of [-1, 1]) stripe(a.x + n.x * off * s, a.z + n.z * off * s, b.x + n.x * off * s, b.z + n.z * off * s, 0.16);
  }
}
for (const k of ["itToYard", "itLeave", "etToYard", "etToOut", "itToQuay", "ambLoop", "toRail", "railLeave"]) laneEdges(P[k]);

// ---------- 集装箱船 ----------
const ship = { g: new THREE.Group(), x: 0 };
ship.g.position.set(0, 0, SHIP_Z);
world.add(ship.g);
ship.setX = (x) => {
  ship.x = x;
  ship.g.position.x = x;
  moorLines.visible = Math.abs(x) < 0.01;
};
ship.docked = () => Math.abs(ship.x) < 0.01;
const SHIP_BAYS = [52, 39, 26, 13, 0, -13, -26, -39];
const shipH = {}; // 每个贝位每列的静态箱层数
function hullShape(B = 13) {
  const s = new THREE.Shape();
  s.moveTo(-70, -B + 3);
  s.quadraticCurveTo(-72, -B, -66, -B);
  s.lineTo(40, -B);
  s.bezierCurveTo(62, -B, 74, -4, 78, 0);
  s.bezierCurveTo(74, 4, 62, B, 40, B);
  s.lineTo(-66, B);
  s.quadraticCurveTo(-72, B, -70, B - 3);
  s.lineTo(-70, -B + 3);
  return s;
}
function extrudeY(shape, h) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 14 });
  g.rotateX(-Math.PI / 2); // 形状平面 → 水平面，挤出方向 → 向上
  return g;
}
{
  const k = new Kit();
  const hs = hullShape();
  k.add(extrudeY(hs, 9.4), 0x9b2f2f, 0, -11, 0, { thr: 35 }); // 水线以下（红色船底漆）
  k.add(extrudeY(hs, 4.8), 0x1f2d44, 0, -1.6, 0, { thr: 35 }); // 干舷
  k.add(extrudeY(hs, 0.35), 0xf1f5f9, 0, 2.9, 0, { s: [1.002, 1, 1.004], thr: 35 }); // 舷墙白边
  k.add(extrudeY(hullShape(12.4), 0.1), 0x5d6773, 0, 3.2, 0, { edge: false }); // 甲板
  // 艏楼
  const bowPts = hs.getPoints(14).filter((p) => p.x >= 57);
  const bow = new THREE.Shape(bowPts);
  k.add(extrudeY(bow, 2.4), 0x1f2d44, 0, 3.2, 0, { thr: 35 });
  k.add(extrudeY(bow, 0.25), 0xf1f5f9, 0, 5.6, 0, { thr: 35 });
  // 舱盖板、绑扎桥
  for (const bx of SHIP_BAYS) {
    const wide = bx === 52 ? 20 : 24.4;
    k.add(BOX(12.6, 0.6, wide), 0x66727f, bx, 3.5, 0);
    k.add(BOX(12.2, 0.08, wide - 1), 0x74808c, bx, 3.84, 0, { edge: false });
    if (bx !== 52) {
      const lx = bx + 6.55;
      for (let z = -12; z <= 12; z += 4) k.add(BOX(0.35, 5.2, 0.35), 0xd6dbe1, lx, 6.4, z);
      k.add(BOX(1.1, 0.18, 24.4), 0xd6dbe1, lx, 9.0, 0);
      k.seg(V3(lx - 0.5, 10.1, -12.2), V3(lx - 0.5, 10.1, 12.2)).seg(V3(lx + 0.5, 10.1, -12.2), V3(lx + 0.5, 10.1, 12.2));
    }
  }
  // 上层建筑（生活区 + 驾驶台）
  const W = 0xf2f4f7, GL = 0x1b2c42;
  k.add(BOX(12, 14, 20), W, -58, 10.2, 0);
  for (const y of [6.2, 9, 11.8, 14.6]) {
    k.add(BOX(0.08, 0.8, 17), GL, -51.96, y, 0, { cls: "glass" });
    k.add(BOX(9.5, 0.8, 0.08), GL, -58, y, 10.02, { cls: "glass" });
    k.add(BOX(9.5, 0.8, 0.08), GL, -58, y, -10.02, { cls: "glass" });
  }
  k.add(BOX(10, 3, 27), W, -57, 18.7, 0);
  k.add(BOX(0.08, 1.2, 25.5), GL, -51.96, 19, 0, { cls: "glass" });
  k.add(BOX(10.4, 0.25, 27.4), 0xd1d6dc, -57, 20.3, 0);
  k.add(BOX(6, 1.4, 9), W, -58, 21.1, 0);
  k.add(CYL(0.18, 0.24, 6, 8), 0x9aa3ad, -58, 24.8, 0, { cls: "metal", thr: 40 });
  k.add(BOX(0.25, 0.25, 3.2), 0x9aa3ad, -58, 26.6, 0, { cls: "metal" });
  // 烟囱
  k.add(BOX(5, 6, 4.5), 0x1f2d44, -66, 14.2, 0);
  k.add(BOX(5.04, 1.8, 4.54), 0xf08a24, -66, 17.9, 0);
  k.add(BOX(5.08, 1.0, 4.58), 0x16181c, -66, 19.3, 0);
  k.add(BOX(8, 3, 16), W, -65, 9.2, 0);
  // 救生艇
  for (const s of [-1, 1]) {
    k.add(BOX(6, 1.4, 2.2), 0xf97316, -59, 12.5, s * 11.4);
    k.add(BOX(5.2, 0.6, 1.6), 0xfb923c, -59, 13.5, s * 11.4);
  }
  // 艉旗杆
  k.add(CYL(0.06, 0.08, 5, 6), 0xcbd5e1, -69.5, 5.7, 0, { thr: 40 });
  k.build(ship.g);
  // 船名
  const name = (w, flip) =>
    signMesh(w, 1.6, (g, cw, ch) => {
      textFill(g, "HAI YUN STAR  海运之星", cw / 2, ch / 2, ch * 0.62, "#f8fafc", { maxW: cw * 0.96 });
    }, { transparent: true, ppm: 40 });
  const n1 = name(22);
  n1.position.set(22, 1.4, 13.03);
  const n2 = name(22);
  n2.position.set(22, 1.4, -13.03);
  n2.rotation.y = Math.PI;
  const n3 = signMesh(12, 2.6, (g, cw, ch) => {
    textFill(g, "HAI YUN STAR", cw / 2, ch * 0.32, ch * 0.3, "#f8fafc");
    textFill(g, "SHANGHAI", cw / 2, ch * 0.74, ch * 0.24, "#f8fafc");
  }, { transparent: true, ppm: 40 });
  n3.position.set(-70.03, 0.8, 0);
  n3.rotation.y = -Math.PI / 2;
  ship.g.add(n1, n2, n3);
  // 雷达（环境动效：旋转）
  ship.radar = new THREE.Group();
  ship.radar.position.set(-58, 27.2, 0);
  new Kit().add(BOX(0.3, 0.25, 4.2), 0x334155, 0, 0, 0).build(ship.radar);
  ship.g.add(ship.radar);
  // 艉旗（环境动效：飘动）
  const fg = new THREE.PlaneGeometry(2.4, 1.5, 8, 2);
  fg.translate(1.2, 0, 0);
  ship.flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0xdc2626, side: THREE.DoubleSide, roughness: 0.8 }));
  ship.flag.position.set(-69.5, 7.4, 0);
  ship.flag.rotation.y = Math.PI;
  ship.flag.userData.base = Float32Array.from(fg.attributes.position.array);
  ship.g.add(ship.flag);

  // 甲板上的箱垛
  const list = [];
  SHIP_BAYS.forEach((bx) => {
    shipH[bx] = [];
    for (let r = 0; r < 10; r++) {
      let h = 2 + Math.floor(rnd() * 4);
      if (r === 0 || r === 9) h = Math.min(h, 4);
      if (bx === 52 && (r === 0 || r === 9)) h = 0;
      if (bx === -39) h = Math.min(h, 4);
      shipH[bx][r] = h;
    }
  });
  shipH[0][9] = 3; // 进口箱在第 4 层（最上层）
  shipH[0][8] = 3; // 出口箱将放在第 4 层
  shipH[0][7] = 4;
  shipH[39][9] = 2;
  shipH[-39][9] = 2;
  SHIP_BAYS.forEach((bx) => {
    for (let r = 0; r < 10; r++) for (let t = 0; t < shipH[bx][r]; t++) list.push({ x: bx, y: shipY(t), z: shipRowZ(r), color: pickColor(), brand: pickBrand() });
  });
  buildStacks(ship.g, list);
  pickable(ship.g, "ship");
}
// 缆绳
const moorLines = (() => {
  const pts = [];
  const q = (x) => V3(x, 0.9, QUAY + 1.2);
  for (const [sx, qx] of [[70, 88], [66, 72], [-66, -88], [-62, -72]]) pts.push(V3(sx, 3.6, SHIP_Z + 12.2), q(qx));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3b2f1e }));
  world.add(l);
  return l;
})();

// ---------- 起重机（岸桥 / 场桥）通用部分 ----------
function buildSpreader(g, lamp) {
  const k = new Kit();
  const Y = 0xf2b705, D = 0x2b3440;
  k.add(BOX(3.6, 0.7, 2.3), Y, 0, 0.45, 0);
  for (const s of [-1, 1]) k.add(BOX(12.1, 0.4, 0.3), Y, 0, 0.25, s * 0.95);
  for (const s of [-1, 1]) k.add(BOX(0.45, 0.5, 2.44), Y, s * 5.95, 0.25, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(BOX(0.3, 0.8, 0.3), D, sx * 6.08, -0.2, sz * 1.08);
  k.add(BOX(2.6, 0.8, 2.0), D, 0, 1.3, 0);
  for (const s of [-1, 1]) k.add(CYL(0.42, 0.42, 0.22, 12), 0x475569, s * 0.8, 1.75, 0, { rx: Math.PI / 2, thr: 40 });
  k.build(g);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(BOX(0.25, 0.2, 0.25), lamp);
    m.position.set(s * 1.6, 0.9, 0);
    g.add(m);
  }
}
class Hoist {
  initHoist(topY, sx, sz) {
    this.topY = topY;
    this.rs = [sx, sz];
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    this.spreader = new THREE.Group();
    buildSpreader(this.spreader, this.lampMat);
    this.g.add(this.spreader);
    this.ropeGeo = new THREE.BufferGeometry();
    this.ropeGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3));
    const ropes = new THREE.LineSegments(this.ropeGeo, new THREE.LineBasicMaterial({ color: 0x20252c }));
    ropes.frustumCulled = false;
    this.g.add(ropes);
  }
  set(tz, hy) {
    this.tz = tz;
    this.hy = hy;
    this.trolley.position.z = tz;
    this.spreader.position.set(0, hy, tz);
    const a = this.ropeGeo.attributes.position, [sx, sz] = this.rs;
    let i = 0;
    for (const x of [-sx, sx]) for (const z of [-sz, sz]) {
      a.setXYZ(i++, x, this.topY, tz + z);
      a.setXYZ(i++, x * 0.6, hy + 1.7, tz + z * 0.6);
    }
    a.needsUpdate = true;
  }
  lamp(on) { this.lampMat.color.set(on ? 0x22c55e : 0xf59e0b); }
}

// ---------- 岸桥 ----------
class STS extends Hoist {
  constructor(x, no) {
    super();
    this.g = new THREE.Group();
    this.g.position.x = x;
    world.add(this.g);
    const k = new Kit();
    const B = 0x1d5fae, Wt = 0xe9eef3, D = 0x2b3440, Y = 0xf2c200;
    const SEA = -3, LAND = 27, LX = 8, PY = 34, GY = 36, GT = 38.6;
    // 行走台车
    for (const x of [-LX, LX]) for (const z of [SEA, LAND]) {
      k.add(BOX(7, 1.2, 1.5), D, x, 0.95, z);
      k.add(BOX(3.2, 1.0, 2.0), Y, x, 2.1, z);
      for (let i = -2.5; i <= 2.5; i += 1) k.add(CYL(0.42, 0.42, 0.36, 12), 0x3b4450, x + i, 0.42, z, { rx: Math.PI / 2, thr: 40, cls: "metal" });
      k.add(BOX(0.4, 0.6, 1.0), Y, x - 3.7, 0.9, z).add(BOX(0.4, 0.6, 1.0), Y, x + 3.7, 0.9, z);
    }
    // 门腿
    for (const x of [-LX, LX]) for (const z of [SEA, LAND]) k.add(BOX(1.8, PY - 2.6, 1.8), B, x, 2.6 + (PY - 2.6) / 2, z);
    // 联系横梁、门框
    for (const x of [-LX, LX]) {
      k.add(BOX(1.4, 1.6, LAND - SEA), B, x, 14, (SEA + LAND) / 2);
      k.add(BOX(1.4, 2.0, LAND - SEA), B, x, PY - 1, (SEA + LAND) / 2);
      k.beam(V3(x, 15, SEA + 1), V3(x, PY - 2, 12), 0.8, B);
      k.beam(V3(x, 15, LAND - 1), V3(x, PY - 2, 12), 0.8, B);
    }
    for (const z of [SEA, LAND]) k.add(BOX(2 * LX + 1.8, 2.2, 1.8), B, 0, PY - 1.1, z);
    // 主梁 / 前大梁
    const Z0 = -48, Z1 = 40, GL = Z1 - Z0, GZ = (Z0 + Z1) / 2;
    for (const s of [-1, 1]) {
      k.add(BOX(1.2, GT - GY, GL), Wt, s * 3.4, (GY + GT) / 2, GZ);
      k.add(BOX(0.9, 0.1, GL), D, s * 4.6, GY + 0.1, GZ); // 走台
      for (let z = Z0 + 1; z <= Z1; z += 3) k.seg(V3(s * 5.05, GY + 0.15, z), V3(s * 5.05, GY + 1.2, z));
      k.seg(V3(s * 5.05, GY + 1.2, Z0 + 1), V3(s * 5.05, GY + 1.2, Z1)).seg(V3(s * 5.05, GY + 0.7, Z0 + 1), V3(s * 5.05, GY + 0.7, Z1));
      for (const z of [SEA, LAND]) k.add(BOX(1, GY - PY, 1), B, s * 3.4, (GY + PY) / 2, z);
    }
    for (let z = Z0 + 2; z <= Z1 - 1; z += 8) k.add(BOX(8, 0.5, 0.5), Wt, 0, GY + 0.25, z);
    k.add(BOX(8.4, 1.2, 0.8), Wt, 0, GY + 0.8, Z0 + 0.4);
    // A 字架与拉杆
    const apex = 62, AZ = 22;
    for (const s of [-1, 1]) {
      k.beam(V3(s * LX, PY, LAND), V3(s * 4, apex, AZ), 1.3, B);
      k.beam(V3(s * LX, GT, 6), V3(s * 4, apex, AZ), 1.1, B);
      k.beam(V3(s * 4, apex, AZ), V3(s * 3.4, GT, -20), 0.36, D, { round: true });
      k.beam(V3(s * 4, apex, AZ), V3(s * 3.4, GT, -46), 0.36, D, { round: true });
      k.beam(V3(s * 4, apex, AZ), V3(s * 3.4, GT, 39), 0.36, D, { round: true });
      // 爬梯
      for (let y = 4; y < PY - 2; y += 3) k.seg(V3(s * LX + s * 1.1, y, LAND - 0.9), V3(s * LX + s * 1.1, y + 3, LAND + 0.9));
    }
    k.add(BOX(9.2, 1.5, 1.5), B, 0, apex, AZ);
    // 机器房
    k.add(BOX(11, 5.4, 9.5), Wt, 0, GT + 2.7, 33);
    k.add(BOX(11.06, 0.8, 9.56), B, 0, GT + 4.2, 33);
    k.add(BOX(11.5, 0.3, 10), 0xcbd5e1, 0, GT + 5.55, 33);
    for (const z of [30, 33, 36]) k.add(BOX(0.06, 1.0, 1.6), 0x1b2c42, 5.52, GT + 2.4, z, { cls: "glass" });
    // 电气房、电缆卷筒
    k.add(BOX(2.6, 3.2, 4), Wt, LX + 2.2, 22, LAND);
    k.add(CYL(1.8, 1.8, 1.1, 20), D, LX + 1.6, 4.5, LAND + 1.8, { rz: Math.PI / 2, thr: 40 });
    k.build(this.g);
    // 编号牌
    const sign = signMesh(6, 2, (g, w, h) => {
      g.fillStyle = "#1d5fae";
      g.fillRect(0, 0, w, h);
      textFill(g, no, w / 2, h / 2, h * 0.6, "#fff", { font: "Arial, sans-serif" });
    });
    sign.position.set(0, GT + 2.4, 37.79);
    this.g.add(sign);
    // 臂架端部警示灯（环境动效：闪烁）
    this.warn = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(BOX(0.4, 0.4, 0.4), this.warn);
      m.position.set(s * 3.4, GT + 0.3, Z0 + 0.2);
      this.g.add(m);
    }
    const ap = new THREE.Mesh(BOX(0.5, 0.5, 0.5), this.warn);
    ap.position.set(0, apex + 1, AZ);
    this.g.add(ap);
    // 小车 + 司机室
    this.trolley = new THREE.Group();
    this.trolley.position.y = GT;
    const t = new Kit();
    t.add(BOX(8.4, 1.6, 6), Wt, 0, 0.8, 0);
    t.add(BOX(8.5, 0.3, 6.1), B, 0, 1.45, 0);
    for (const s of [-1, 1]) for (const z of [-2.2, 2.2]) t.add(CYL(0.35, 0.35, 0.3, 12), D, s * 3.4, 0.1, z, { rz: Math.PI / 2, thr: 40 });
    t.add(BOX(2.2, 2.6, 2.8), Wt, 4.9, -3.6, -1.2);
    t.add(BOX(2.24, 1.4, 0.06), 0x1b2c42, 4.9, -3.3, -2.62, { cls: "glass" });
    t.add(BOX(0.06, 1.4, 2.2), 0x1b2c42, 6.01, -3.3, -1.2, { cls: "glass" });
    t.add(BOX(0.4, 2.3, 0.4), D, 4.9, -1.2, -1.2);
    t.build(this.trolley);
    this.g.add(this.trolley);
    this.initHoist(GT, 1.0, 0.8);
    this.set(10, 30);
    pickable(this.g, "sts");
  }
}

// ---------- 场桥（RTG） ----------
class RTG extends Hoist {
  constructor(x, zc, no, info = "rtg", color = 0xf2b705) {
    super();
    this.g = new THREE.Group();
    this.g.position.set(x, 0, zc);
    this.x = x;
    world.add(this.g);
    const k = new Kit();
    const Y = color, D = 0x2b3440, Wt = 0xeef2f6;
    const SZ = 11.6, LX = 3.6, TOP = 20;
    for (const z of [-SZ, SZ]) {
      k.add(BOX(9.6, 1.2, 1.4), Y, 0, 1.9, z);
      for (const x of [-LX, LX]) {
        k.add(BOX(1.1, TOP - 2.5, 1.1), Y, x, 2.5 + (TOP - 2.5) / 2, z);
        k.add(BOX(1.8, 0.5, 1.9), D, x, 1.1, z);
      }
      k.add(BOX(9.2, 1.4, 1.4), Y, 0, TOP + 0.2, z);
      k.beam(V3(-LX, 3, z), V3(LX, TOP - 0.6, z), 0.5, Y);
    }
    for (const s of [-1, 1]) {
      k.add(BOX(0.9, 1.6, 2 * SZ + 2.2), Y, s * 3.2, TOP + 1.7, 0);
      for (let z = -SZ; z <= SZ; z += 2.9) k.seg(V3(s * 3.75, TOP + 2.5, z), V3(s * 3.75, TOP + 3.5, z));
      k.seg(V3(s * 3.75, TOP + 3.5, -SZ), V3(s * 3.75, TOP + 3.5, SZ));
    }
    // 柴油发电机房、电气柜、爬梯
    k.add(BOX(3.6, 2.4, 1.8), Wt, 0, 3.8, SZ + 1.5);
    k.add(BOX(3.64, 0.3, 1.84), Y, 0, 5.1, SZ + 1.5);
    k.add(CYL(0.12, 0.12, 1.2, 8), 0x6b7280, 1.2, 5.6, SZ + 1.9, { thr: 40 });
    for (let y = 3; y < TOP; y += 2.5) k.seg(V3(LX + 0.7, y, SZ - 0.5), V3(LX + 0.7, y + 2.5, SZ + 0.5));
    k.build(this.g);
    this.wheels = [];
    for (const x of [-LX, LX]) for (const z of [-SZ, SZ]) {
      const w = new THREE.Group();
      w.position.set(x, 0.85, z);
      const wk = new Kit();
      for (const dz of [-0.48, 0.48]) {
        wk.add(CYL(0.85, 0.85, 0.7, 18), 0x22252a, 0, 0, dz, { rx: Math.PI / 2, cls: "rubber", thr: 40 });
        wk.add(CYL(0.45, 0.45, 0.72, 10), 0xb0b8c2, 0, 0, dz, { rx: Math.PI / 2, cls: "metal", thr: 40 });
        wk.add(BOX(0.9, 0.12, 0.74), 0x6b7280, 0, 0, dz, { edge: false });
      }
      wk.build(w);
      this.g.add(w);
      this.wheels.push(w);
    }
    const sign = signMesh(4.4, 1.3, (g, w, h) => {
      g.fillStyle = "#1f2937";
      g.fillRect(0, 0, w, h);
      textFill(g, no, w / 2, h / 2, h * 0.62, "#f2b705", { font: "Arial, sans-serif" });
    });
    sign.position.set(3.66, TOP + 1.7, 0);
    sign.rotation.y = Math.PI / 2;
    this.g.add(sign);
    this.beacon = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const bm = new THREE.Mesh(CYL(0.25, 0.25, 0.4, 10), this.beacon);
    bm.position.set(0, TOP + 2.8, SZ);
    this.g.add(bm);
    this.trolley = new THREE.Group();
    this.trolley.position.y = TOP + 2.5;
    const t = new Kit();
    t.add(BOX(7.6, 1.5, 4.2), Y, 0, 0.75, 0);
    t.add(BOX(7.7, 0.25, 4.3), D, 0, 1.55, 0);
    t.add(BOX(1.9, 2.2, 2.2), Wt, 4.4, -1.6, 0);
    t.add(BOX(1.94, 1.1, 0.05), 0x1b2c42, 4.4, -1.4, -1.12, { cls: "glass" });
    t.add(BOX(1.94, 1.1, 0.05), 0x1b2c42, 4.4, -1.4, 1.12, { cls: "glass" });
    t.build(this.trolley);
    this.g.add(this.trolley);
    this.initHoist(TOP + 2.5, 0.9, 0.7);
    this.set(0, 17);
    pickable(this.g, info);
  }
  setX(x) {
    const d = x - this.x;
    this.x = x;
    this.g.position.x = x;
    for (const w of this.wheels) w.rotation.z -= d / 0.85;
  }
}

// ---------- 集卡 ----------
function wheelAxle(parent, x, r, track, dual) {
  const g = new THREE.Group();
  g.position.set(x, r, 0);
  const k = new Kit();
  const w = dual ? 0.52 : 0.32;
  for (const s of [-1, 1]) {
    k.add(CYL(r, r, w, 18), 0x202328, 0, 0, s * track, { rx: Math.PI / 2, cls: "rubber", thr: 40 });
    k.add(CYL(r * 0.56, r * 0.56, w + 0.02, 12), 0xaeb6c0, 0, 0, s * track, { rx: Math.PI / 2, cls: "metal", thr: 40 });
    for (const rz of [0, Math.PI / 2]) k.add(BOX(r * 1.05, r * 0.14, 0.03), 0x6b7280, 0, 0, s * (track + w / 2 + 0.02), { rz, edge: false });
  }
  k.build(g);
  parent.add(g);
  return { g, r };
}
function buildTrailer(parent, axles) {
  const k = new Kit();
  const D = 0x2b2f36, G = 0x4b5563;
  for (const s of [-1, 1]) k.add(BOX(12.3, 0.42, 0.2), D, 0, 1.02, s * 0.52);
  for (const x of [-5.4, -3.6, -1.8, 0, 1.8, 3.6, 5.4]) k.add(BOX(0.14, 0.18, 2.3), G, x, 1.12, 0);
  for (const x of [-6.02, 6.02]) {
    k.add(BOX(0.28, 0.3, 2.44), D, x, 1.2, 0);
    for (const z of [-1.08, 1.08]) k.add(BOX(0.2, 0.12, 0.2), 0xf2c200, x, 1.38, z);
  }
  for (const s of [-1, 1]) {
    k.add(BOX(0.14, 0.75, 0.14), G, 3.9, 0.55, s * 0.62);
    k.add(BOX(0.3, 0.06, 0.3), D, 3.9, 0.19, s * 0.62);
    k.add(BOX(3.2, 0.06, 0.66), D, -4.6, 1.04, s * 0.96);
    k.add(BOX(0.05, 0.12, 0.3), 0xef4444, -6.3, 0.82, s * 0.95, { cls: "glow" });
    k.add(BOX(0.04, 0.5, 0.5), 0x111318, -6.1, 0.55, s * 0.96, { edge: false });
  }
  k.add(BOX(0.12, 0.14, 2.3), 0x9ca3af, -6.25, 0.62, 0, { cls: "metal" });
  for (const x of [-3.4, -4.6, -5.8]) k.add(CYL(0.07, 0.07, 2.0, 8), G, x, 0.5, 0, { rx: Math.PI / 2, thr: 40 });
  k.build(parent);
  for (const x of [-3.4, -4.6, -5.8]) axles.push(wheelAxle(parent, x, 0.5, 0.95, true));
}
function buildRoadTractor(parent, color, axles) {
  const k = new Kit();
  const D = 0x2b2f36, GL = 0x1c2e45;
  k.add(BOX(6.2, 0.32, 0.9), D, 1.7, 0.95, 0);
  k.add(CYL(0.55, 0.55, 0.12, 20), 0x374151, 0, 1.2, 0, { thr: 40 });
  const sh = new THREE.Shape();
  sh.moveTo(2.3, 1.25); sh.lineTo(5.55, 1.25); sh.lineTo(5.62, 2.35); sh.lineTo(5.42, 3.55); sh.lineTo(5.05, 3.85); sh.lineTo(2.3, 3.85); sh.lineTo(2.3, 1.25);
  const cab = new THREE.ExtrudeGeometry(sh, { depth: 2.44, bevelEnabled: false });
  cab.translate(0, 0, -1.22);
  k.add(cab, color, 0, 0, 0, { thr: 20 });
  const sh2 = new THREE.Shape();
  sh2.moveTo(2.4, 3.85); sh2.lineTo(4.9, 3.85); sh2.lineTo(4.1, 4.4); sh2.lineTo(2.4, 4.45); sh2.lineTo(2.4, 3.85);
  const fair = new THREE.ExtrudeGeometry(sh2, { depth: 2.3, bevelEnabled: false });
  fair.translate(0, 0, -1.15);
  k.add(fair, color, 0, 0, 0, { thr: 20 });
  k.add(BOX(0.06, 1.05, 2.2), GL, 5.53, 2.98, 0, { rz: 0.12, cls: "glass" });
  for (const s of [-1, 1]) {
    k.add(BOX(1.1, 0.75, 0.04), GL, 4.75, 3.05, s * 1.235, { cls: "glass" });
    k.add(BOX(3.2, 0.16, 0.03), 0xf8fafc, 3.9, 2.15, s * 1.235, { edge: false });
    k.add(BOX(0.06, 0.18, 0.4), 0xfff7d6, 5.72, 1.05, s * 0.85, { cls: "glow" });
    k.add(CYL(0.09, 0.09, 3.1, 10), 0xc0c7d0, 2.15, 2.9, s * 1.05, { cls: "metal", thr: 40 });
    k.add(BOX(0.5, 0.06, 0.25), 0x9ca3af, 4.9, 0.75, s * 1.3);
    k.add(BOX(0.05, 0.45, 0.18), D, 5.3, 3.0, s * 1.58);
    k.add(BOX(0.05, 0.05, 0.36), D, 5.3, 3.3, s * 1.42);
    k.add(BOX(1.9, 0.06, 0.62), D, -0.95, 1.12, s * 0.96);
  }
  k.add(BOX(0.05, 0.75, 1.3), 0x30343b, 5.6, 1.85, 0);
  for (const y of [1.6, 1.8, 2.0]) k.add(BOX(0.06, 0.05, 1.25), 0x9ca3af, 5.63, y, 0, { edge: false });
  k.add(BOX(0.32, 0.38, 2.5), 0x9aa3ad, 5.72, 0.95, 0, { cls: "metal" });
  k.add(CYL(0.3, 0.3, 1.3, 14), 0xb8c0ca, 3.4, 0.95, 1.0, { rz: Math.PI / 2, cls: "metal", thr: 40 });
  k.add(BOX(1, 0.5, 0.5), D, 3.4, 0.95, -1.0);
  k.build(parent);
  axles.push(wheelAxle(parent, 4.35, 0.5, 1.0, false), wheelAxle(parent, -0.3, 0.5, 0.95, true), wheelAxle(parent, -1.6, 0.5, 0.95, true));
}
function buildYardTractor(parent, color, axles) {
  const k = new Kit();
  const D = 0x2b2f36, GL = 0x1c2e45;
  k.add(BOX(5, 0.4, 1.8), D, 1.3, 0.9, 0);
  k.add(BOX(1.8, 0.22, 1.9), 0x374151, 0, 1.25, 0);
  k.add(BOX(1.5, 1.1, 2.1), color, 3.35, 1.6, 0);
  for (let i = 0; i < 4; i++) k.add(BOX(0.04, 0.06, 1.6), 0x30343b, 4.11, 1.35 + i * 0.2, 0, { edge: false });
  k.add(BOX(1.6, 2.0, 1.3), color, 1.95, 2.25, -0.45);
  k.add(BOX(0.05, 0.95, 1.1), GL, 2.77, 2.75, -0.45, { cls: "glass" });
  k.add(BOX(0.05, 0.9, 1.1), GL, 1.13, 2.75, -0.45, { cls: "glass" });
  k.add(BOX(1.2, 0.8, 0.04), GL, 1.95, 2.75, -1.11, { cls: "glass" });
  k.add(BOX(1.2, 0.8, 0.04), GL, 1.95, 2.75, 0.21, { cls: "glass" });
  k.add(BOX(1.7, 0.1, 1.4), 0x1f2937, 1.95, 3.3, -0.45);
  k.add(CYL(0.08, 0.08, 2.2, 8), 0xc0c7d0, 2.4, 2.6, 0.55, { cls: "metal", thr: 40 });
  k.add(BOX(0.3, 0.35, 2.3), 0x3f4650, 4.2, 0.85, 0);
  for (const s of [-1, 1]) {
    k.add(BOX(0.05, 0.15, 0.3), 0xfff7d6, 4.12, 1.9, s * 0.8, { cls: "glow" });
    k.add(BOX(1.4, 0.06, 0.6), D, -0.1, 1.15, s * 0.96);
    k.add(BOX(1.2, 0.06, 0.4), color, 3.3, 1.15, s * 1.05);
  }
  k.build(parent);
  axles.push(wheelAxle(parent, 3.3, 0.55, 0.95, false), wheelAxle(parent, -0.1, 0.55, 0.95, true));
}
const _ta = V3(), _tb = V3(), _tc = V3(), _td = V3();
class Truck {
  constructor(kind, color, info) {
    this.g = new THREE.Group();
    this.tractor = new THREE.Group();
    this.trailer = new THREE.Group();
    this.g.add(this.tractor, this.trailer);
    world.add(this.g);
    this.axles = [];
    if (kind === "yard") buildYardTractor(this.tractor, color, this.axles);
    else buildRoadTractor(this.tractor, color, this.axles);
    buildTrailer(this.trailer, this.axles);
    this.roll = 0;
    this.path = null;
    this.d = 0;
    if (info) pickable(this.g, info);
  }
  place(path, d) {
    if (this.path === path) this.roll += d - this.d;
    this.path = path;
    this.d = d;
    const pc = path.at(d, _ta), pf = path.at(d + 5.3, _tb), pr = path.at(d - 5, _tc), pt = path.at(d + 9, _td);
    this.trailer.position.copy(pc);
    this.trailer.rotation.y = Math.atan2(-(pf.z - pr.z), pf.x - pr.x);
    this.tractor.position.copy(pf);
    this.tractor.rotation.y = Math.atan2(-(pt.z - pf.z), pt.x - pf.x);
    for (const a of this.axles) a.g.rotation.z = -this.roll / a.r;
  }
  topWorld(out = V3()) { return this.trailer.localToWorld(out.set(0, TRUCK_TOP + 1, 0)); }
}

// ---------- 堆场 ----------
const YARD_BAYS = [-52, -39, -26, -13, 0, 13, 26, 39, 52];
const yardH = {};
{
  const list = [];
  const block = (zc, name, fixed) => {
    const rows = [0, 1, 2, 3, 4, 5].map((r) => zc - 5 + r * 2.5);
    YARD_BAYS.forEach((bx) => {
      const hs = rows.map(() => Math.floor(rnd() * 5));
      if (fixed && fixed[bx]) fixed[bx].forEach((h, i) => (hs[i] = h));
      yardH[name + bx] = hs;
      rows.forEach((z, r) => {
        for (let t = 0; t < hs[r]; t++) list.push({ x: bx, y: yardY(t), z, color: pickColor(), brand: pickBrand() });
        // 箱位线
        const x1 = bx - 6.3, x2 = bx + 6.3, z1 = z - 1.3, z2 = z + 1.3;
        stripe(x1, z1, x2, z1, 0.12);
        stripe(x1, z2, x2, z2, 0.12);
        stripe(x1, z1, x1, z2, 0.12);
        stripe(x2, z1, x2, z2, 0.12);
      });
    });
    // 场桥轮胎走行线
    for (const dz of [-11.6, 11.6]) stripe(-66, zc + dz, 66, zc + dz, 0.4, "yellow");
  };
  // A 区 0 贝：第 2 排放出口箱（第 2 层），第 4 排放进口箱（第 3 层）
  block(YA, "A", { 0: [3, 1, 3, 2, 4, 2], 13: [2, 3, 1, 2, 2, 3] });
  block(YB, "B", { [-26]: [3, 2, 3, 3, 1, 2] });
  // 空箱堆场
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
    const h = 3 + Math.floor(rnd() * 3);
    for (let t = 0; t < h; t++) list.push({ x: 106 + i * 3.2, y: yardY(t), z: 50 + j * 13.5, color: pickColor(), brand: pickBrand(), rot: true });
  }
  const yard = new THREE.Group();
  world.add(yard);
  buildStacks(yard, list.filter((i) => !i.rot));
  const rotG = new THREE.Group();
  const rotList = list.filter((i) => i.rot).map((i) => ({ ...i, x: -i.z, z: i.x }));
  buildStacks(rotG, rotList);
  rotG.rotation.y = Math.PI / 2;
  yard.add(rotG);
  pickable(yard, "yard");
  // 地面区号
  for (const [txt, z] of [["A 区", YA], ["B 区", YB]]) {
    const s = signMesh(10, 5, (g, w, h) => textFill(g, txt, w / 2, h / 2, h * 0.7, "rgba(255,255,255,.85)"), { transparent: true, ppm: 30 });
    s.rotation.x = -Math.PI / 2;
    s.rotation.z = Math.PI / 2;
    s.position.set(-62, 0.05, z);
    world.add(s);
  }
}
const yardTop = (tier) => (tier + 1) * CH; // 放在第 tier 层时箱顶高度

// ---------- 闸口、建筑、灯塔、围栏、树 ----------
const gate = { g: new THREE.Group() };
world.add(gate.g);
{
  const k = new Kit();
  const Wt = 0xeef2f6, B = 0x1d5fae, C = 0xa3a9b1;
  // 车道岛
  for (const [x, w] of [[77, 1.4], [83, 1.4], [90, 3.2], [97, 1.4], [103, 1.4]]) {
    k.add(BOX(w, 0.25, 18), C, x, 0.125, 151);
    k.add(BOX(w + 0.05, 0.05, 0.6), 0xf2c200, x, 0.27, 142.3, { edge: false });
    k.add(BOX(w + 0.05, 0.05, 0.6), 0xf2c200, x, 0.27, 159.7, { edge: false });
  }
  // 雨棚
  for (const x of [77, 83, 90, 97, 103]) for (const z of [146, 156]) k.add(CYL(0.28, 0.28, 7, 10), 0xcbd5e1, x, 3.75, z, { cls: "metal", thr: 40 });
  k.add(BOX(30, 0.8, 15), Wt, 90, 7.6, 151);
  k.add(BOX(30.2, 0.7, 15.2), B, 90, 7.1, 151);
  // 岗亭
  const booth = (x, z) => {
    k.add(BOX(1.3, 2.5, 2.2), Wt, x, 1.5, z);
    k.add(BOX(1.34, 0.9, 1.9), 0x1b2c42, x, 1.9, z, { cls: "glass" });
    k.add(BOX(1.6, 0.15, 2.5), B, x, 2.82, z);
  };
  booth(83, 145.5);
  booth(90, 155.5);
  booth(77, 145.5);
  booth(103, 155.5);
  // 地磅
  k.add(BOX(3.4, 0.08, 18), 0x5b636e, 86, 0.04, 152, { cls: "metal" });
  k.add(BOX(3.4, 0.08, 18), 0x5b636e, 80, 0.04, 152, { cls: "metal" });
  // 箱号识别龙门架
  const portal = (x1, x2, z) => {
    for (const x of [x1, x2]) k.add(BOX(0.45, 6.2, 0.45), 0x94a3b8, x, 3.1, z, { cls: "metal" });
    k.add(BOX(x2 - x1 + 0.45, 0.5, 0.5), 0x94a3b8, (x1 + x2) / 2, 6.2, z, { cls: "metal" });
    for (let x = x1 + 2; x < x2 - 1; x += 3) k.add(BOX(0.35, 0.35, 0.6), 0x1f2937, x, 5.75, z);
  };
  portal(76.8, 89.2, 168);
  portal(90.8, 103.2, 136);
  k.build(gate.g);
  // 灯光与状态（进口道 86 / 出口道 94）
  gate.flashMat = [new THREE.MeshBasicMaterial({ color: 0x475569 }), new THREE.MeshBasicMaterial({ color: 0x475569 })];
  [[76.8, 89.2, 168], [90.8, 103.2, 136]].forEach(([x1, x2, z], i) => {
    const m = new THREE.Mesh(BOX(x2 - x1 - 1, 0.18, 0.2), gate.flashMat[i]);
    m.position.set((x1 + x2) / 2, 5.85, z + (i ? 0.35 : -0.35));
    gate.g.add(m);
  });
  gate.lamp = [];
  gate.arm = [];
  const barrier = (px, z, len) => {
    const post = new Kit().add(BOX(0.4, 1.1, 0.4), 0x475569, px, 0.8, z);
    post.build(gate.g);
    const piv = new THREE.Group();
    piv.position.set(px, 1.2, z);
    const ak = new Kit();
    for (let i = 0; i < 6; i++) ak.add(BOX(len / 6, 0.12, 0.08), i % 2 ? 0xf8fafc : 0xdc2626, 0.2 + (i + 0.5) * (len / 6), 0, 0, { edge: false });
    ak.add(BOX(len, 0.14, 0.1), 0xffffff, 0.2 + len / 2, 0, 0, { cls: "glow", s: [1, 0.01, 1], edge: false });
    ak.build(piv);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(BOX(len, 0.13, 0.09)), LINE);
    e.position.x = 0.2 + len / 2;
    piv.add(e);
    gate.g.add(piv);
    return piv;
  };
  gate.arm[0] = barrier(83.8, 141.2, 3.9); // 进港 86 道
  gate.arm[1] = barrier(91.7, 159.2, 3.9); // 出港 94 道
  barrier(77.8, 141.2, 3.9);
  barrier(97.8, 159.2, 3.9);
  for (const [x, z] of [[83, 144.2], [90, 157.2]]) {
    const red = new THREE.MeshBasicMaterial({ color: 0xef4444 }), green = new THREE.MeshBasicMaterial({ color: 0x1f3a2a });
    const hk = new Kit().add(BOX(0.35, 0.8, 0.3), 0x1f2937, x, 3.4, z);
    hk.build(gate.g);
    const r = new THREE.Mesh(BOX(0.22, 0.22, 0.05), red), gm = new THREE.Mesh(BOX(0.22, 0.22, 0.05), green);
    r.position.set(x, 3.6, z + (z < 150 ? 0.17 : -0.17));
    gm.position.set(x, 3.2, z + (z < 150 ? 0.17 : -0.17));
    gate.g.add(r, gm);
    gate.lamp.push({ red, green });
  }
  // 门楣招牌
  for (const [z, ry] of [[158.62, 0], [143.38, Math.PI]]) {
    const s = signMesh(14, 0.66, (g, w, h) => {
      g.fillStyle = "#1d5fae";
      g.fillRect(0, 0, w, h);
      textFill(g, "海运集装箱码头  闸口 GATE", w / 2, h / 2, h * 0.66, "#fff", { maxW: w * 0.95 });
    });
    s.position.set(90, 7.1, z);
    s.rotation.y = ry;
    gate.g.add(s);
  }
  for (const [x, txt, col, z, ry] of [[80, "进港 1", "#15803d", 158.62, 0], [86, "进港 2", "#15803d", 158.62, 0], [94, "出港 1", "#b91c1c", 143.38, Math.PI], [100, "出港 2", "#b91c1c", 143.38, Math.PI]]) {
    const s = signMesh(2.6, 0.7, (g, w, h) => {
      g.fillStyle = col;
      g.fillRect(0, 0, w, h);
      textFill(g, txt, w / 2, h / 2, h * 0.62, "#fff");
    });
    s.position.set(x, 6.3, z);
    s.rotation.y = ry;
    gate.g.add(s);
  }
  pickable(gate.g, "gate");
  // 车道方向箭头
  for (const [x, z, dir] of [[80, 170, -1], [86, 170, -1], [94, 134, 1], [100, 134, 1]]) {
    const sh = new THREE.Shape();
    sh.moveTo(-0.35, 0); sh.lineTo(0.35, 0); sh.lineTo(0.35, 2); sh.lineTo(0.9, 2); sh.lineTo(0, 3.3); sh.lineTo(-0.9, 2); sh.lineTo(-0.35, 2); sh.lineTo(-0.35, 0);
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    if (dir < 0) g.rotateY(Math.PI);
    g.translate(x, 0.035, z);
    stripes.white.push(g);
  }
  // 闸口外中央隔离带、道路标线
  dashed(83, 166, 83, 360, 4, 5);
  dashed(97, 166, 97, 360, 4, 5);
  stripe(90, 166, 90, 360, 0.25, "yellow");
  for (const x of [76, 104]) stripe(x, 160, x, 360, 0.2);
}
{
  const k = new Kit();
  // 操作中心大楼
  const [c, g] = cvs(512, 256);
  g.fillStyle = "#e9edf2";
  g.fillRect(0, 0, 512, 256);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) {
    g.fillStyle = "#27405f";
    g.fillRect(12 + i * 41.5, 28 + r * 78, 30, 40);
    g.fillStyle = "rgba(255,255,255,.25)";
    g.fillRect(12 + i * 41.5, 28 + r * 78, 30, 8);
  }
  g.fillStyle = "#1d5fae";
  g.fillRect(0, 0, 512, 12);
  const offMat = new THREE.MeshStandardMaterial({ map: toTex(c), roughness: 0.6 });
  const off = new THREE.Mesh(BOX(28, 12, 14), [offMat, offMat, new THREE.MeshStandardMaterial({ color: 0xd9dee4 }), offMat, offMat, offMat]);
  off.position.set(140, 6, 135);
  off.castShadow = off.receiveShadow = true;
  off.add(new THREE.LineSegments(edgesOf(BOX(28, 12, 14), 30), LINE));
  world.add(off);
  pickable(off, "office");
  k.add(BOX(28.6, 0.8, 14.6), 0xcfd5dc, 140, 12.4, 135);
  k.add(BOX(6, 0.3, 3), 0x1d5fae, 140, 3.6, 143.5);
  for (const x of [137.5, 142.5]) k.add(CYL(0.15, 0.15, 3.5, 8), 0xcbd5e1, x, 1.75, 144.6, { thr: 40 });
  const sign = signMesh(16, 2, (g2, w, h) => {
    g2.fillStyle = "#1d5fae";
    g2.fillRect(0, 0, w, h);
    textFill(g2, "码头操作中心", w / 2, h / 2, h * 0.62, "#fff");
  });
  sign.position.set(140, 14.2, 142.3);
  world.add(sign);
  k.add(BOX(16.4, 2.4, 0.4), 0x9aa3ad, 140, 14.2, 142.05);
  // 集装箱货运站（CFS）仓库
  const cfs = new THREE.Group();
  const ck = new Kit();
  ck.add(BOX(60, 8, 22), 0xd7dce2, 0, 4, 0);
  const roof = new THREE.Shape();
  roof.moveTo(-11.5, 0); roof.lineTo(11.5, 0); roof.lineTo(0, 3); roof.lineTo(-11.5, 0);
  const rg = new THREE.ExtrudeGeometry(roof, { depth: 61, bevelEnabled: false });
  rg.rotateY(Math.PI / 2);
  rg.translate(-30.5, 8, 0);
  ck.add(rg, 0x5c7ea8, 0, 0, 0);
  for (let x = -24; x <= 24; x += 8) {
    ck.add(BOX(4.4, 5, 0.1), 0x9aa6b2, x, 2.5, -11.05);
    for (let y = 0.6; y < 5; y += 0.5) ck.seg(V3(x - 2.2, y, -11.12), V3(x + 2.2, y, -11.12));
    ck.add(BOX(5, 0.25, 1.2), 0x6b7684, x, 5.3, -11.6);
  }
  ck.add(BOX(60, 1.2, 3), 0xa3a9b1, 0, 0.6, -12.5);
  ck.build(cfs);
  const cs = signMesh(18, 1.8, (g2, w, h) => {
    g2.fillStyle = "#1f2937";
    g2.fillRect(0, 0, w, h);
    textFill(g2, "集装箱货运站 CFS", w / 2, h / 2, h * 0.6, "#fff");
  });
  cs.position.set(0, 7, -11.06);
  cs.rotation.y = Math.PI;
  cfs.add(cs);
  cfs.position.set(-40, 0, 143);
  world.add(cfs);
  pickable(cfs, "cfs");
  // 高杆灯
  for (const [x, z] of [[-86, 40], [104, 40], [-86, 118], [112, 116], [10, 140], [-100, -2], [110, -2]]) {
    k.add(CYL(0.3, 0.55, 30, 10), 0xaab2bc, x, 15, z, { cls: "metal", thr: 40 });
    k.add(BOX(4.2, 0.3, 1.2), 0x6b7280, x, 30.2, z);
    for (const dx of [-1.5, -0.5, 0.5, 1.5]) k.add(BOX(0.8, 0.5, 0.9), 0xe5e7eb, x + dx, 29.8, z);
    for (let y = 1; y < 29; y += 1) k.seg(V3(x + 0.5, y, z), V3(x + 0.5, y + 0.5, z));
  }
  // 围栏
  const fence = (x1, x2, z) => {
    for (let x = x1; x <= x2; x += 3) k.add(BOX(0.12, 2.4, 0.12), 0x7c8591, x, 1.2, z, { edge: false });
    for (const y of [0.3, 1.2, 2.1, 2.35]) k.seg(V3(x1, y, z), V3(x2, y, z));
    for (let x = x1; x < x2; x += 1.5) k.seg(V3(x, 0.3, z), V3(x + 1.5, 2.1, z));
  };
  fence(-160, 75, 162);
  fence(105, 170, 162);
  // 树
  const tree = (x, z, s = 1) => {
    k.add(CYL(0.18 * s, 0.25 * s, 2.4 * s, 6), 0x7a5a3a, x, 1.2 * s, z, { edge: false });
    k.add(new THREE.IcosahedronGeometry(1.8 * s, 0), 0x5f9a4f, x, 3.4 * s, z, { cls: "flat", thr: 60 });
    k.add(new THREE.IcosahedronGeometry(1.2 * s, 0), 0x74b060, x + 0.3 * s, 4.6 * s, z - 0.2 * s, { cls: "flat", thr: 60 });
  };
  for (let z = 172; z < 330; z += 11) {
    tree(70 + rnd() * 2, z, 0.9 + rnd() * 0.4);
    tree(110 + rnd() * 2, z + 5, 0.9 + rnd() * 0.4);
  }
  for (let x = 120; x < 165; x += 9) tree(x, 150 + rnd() * 2, 1);
  for (let x = -150; x < 60; x += 14) tree(x, 172 + rnd() * 4, 0.9 + rnd() * 0.5);
  // 停车场的小汽车
  for (let i = 0; i < 6; i++) {
    const x = 128 + i * 3.6, z = 120, col = PALETTE[(i * 3) % PALETTE.length];
    k.add(BOX(1.8, 0.7, 4.3), col, x, 0.65, z);
    k.add(BOX(1.6, 0.6, 2.2), 0x1c2e45, x, 1.3, z - 0.2, { cls: "glass" });
  }
  k.build(world);
}
// 标线合并
for (const [col, list] of Object.entries(stripes)) {
  if (!list.length) continue;
  const geos = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute("normal");
    n.deleteAttribute("uv");
    return n;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: col === "white" ? 0xf4f6f8 : 0xe8b923, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.renderOrder = 1;
  world.add(m);
}

// ---------- 主要设备 ----------
const crane = new STS(0, "QC 03");
const craneL = new STS(-39, "QC 02");
const craneR = new STS(39, "QC 04");
const rtgA = new RTG(13, YA, "RTG A-1");
const rtgB = new RTG(-26, YB, "RTG B-2");

// ---------- 铁路装卸线（海铁联运换装） ----------
const RAIL_Z = 80, RAIL2_Z = 86, RMG_Z = 78, RAIL_LANE = 69;
const WAGON_TOP = 1.55; // 平车承箱面高度
const WAGON_X = -150; // 目标平车中心
{
  const k = new Kit();
  for (const z of [RAIL_Z, RAIL2_Z]) {
    k.add(BOX(700, 0.25, 3.6), 0x9b9186, -370, 0.12, z, { edge: false });
    for (let x = -720; x < -20; x += 0.9) k.add(BOX(0.25, 0.14, 2.6), 0x5b4a3a, x, 0.3, z, { edge: false });
    for (const s2 of [-0.72, 0.72]) k.add(BOX(700, 0.16, 0.12), 0x6b7280, -370, 0.45, z + s2, { cls: "metal" });
    k.add(BOX(0.6, 1.2, 3.2), 0xc0392b, -22, 0.6, z); // 车挡
  }
  k.build(world);
  for (const dz of [-11.6, 11.6]) stripe(-260, RMG_Z + dz, -110, RMG_Z + dz, 0.4, "yellow");
  const s = signMesh(14, 4, (g, w, h) => textFill(g, "铁路装卸线", w / 2, h / 2, h * 0.6, "rgba(255,255,255,.85)"), { transparent: true, ppm: 30 });
  s.rotation.x = -Math.PI / 2;
  s.position.set(-120, 0.05, 63.5);
  world.add(s);
}
function buildWagon(parent, x) {
  const k = new Kit();
  const B = 0x3a3f47, R = 0x7c2d24;
  k.add(BOX(13.9, 0.32, 2.8), R, x, 1.36, 0);
  for (const sz of [-1, 1]) k.add(BOX(13.9, 0.5, 0.16), B, x, 1.05, sz * 1.25);
  k.add(BOX(13.4, 0.55, 0.5), B, x, 0.98, 0);
  for (const sx of [-1, 1]) {
    k.add(BOX(0.4, 0.3, 0.3), 0x1f2328, x + sx * 7.15, 1.05, 0);
    for (const sz of [-1, 1]) k.add(BOX(0.22, 0.14, 0.22), 0xf2c200, x + sx * 6.05, 1.58, sz * 1.1);
    // 转向架
    const bx = x + sx * 5.2;
    k.add(BOX(3.2, 0.5, 2.2), 0x2a2e34, bx, 0.8, 0);
    for (const dx of [-0.9, 0.9]) for (const sz of [-1, 1]) k.add(CYL(0.42, 0.42, 0.14, 14), 0x2f3338, bx + dx, 0.84, sz * 0.72, { rx: Math.PI / 2, cls: "metal", thr: 40 });
  }
  k.build(parent);
}
const train = { g: new THREE.Group(), x: 0 };
world.add(train.g);
train.g.position.z = RAIL_Z;
train.setX = (x) => {
  train.x = x;
  train.g.position.x = x;
};
{
  const cars = [-2, -1, 0, 1, 2].map((i) => WAGON_X + i * 14.6);
  cars.forEach((x) => buildWagon(train.g, x));
  const list = [];
  cars.forEach((x) => {
    if (x !== WAGON_X) list.push({ x, y: WAGON_TOP + CH / 2, z: 0, color: pickColor(), brand: pickBrand() });
  });
  buildStacks(train.g, list);
  // 内燃机车（在西端，发车向西）
  const lx = cars[0] - 7.3 - 10;
  const k = new Kit();
  const G = 0x1f6f4a, Yl = 0xf2c200, D = 0x2a2e34;
  k.add(BOX(19, 0.5, 3.0), D, lx, 1.2, 0);
  k.add(BOX(18.4, 2.6, 2.9), G, lx, 2.75, 0);
  k.add(BOX(18.5, 0.3, 2.95), Yl, lx, 2.2, 0, { edge: false });
  k.add(BOX(3.2, 0.5, 2.6), 0x2f3a45, lx, 4.3, 0);
  for (const sx of [-1, 1]) {
    k.add(BOX(0.06, 0.9, 2.2), 0x1c2e45, lx + sx * 9.22, 3.35, 0, { cls: "glass" });
    for (const sz of [-1, 1]) k.add(BOX(1.2, 0.7, 0.05), 0x1c2e45, lx + sx * 8.1, 3.35, sz * 1.46, { cls: "glass" });
    k.add(BOX(0.1, 0.2, 0.3), 0xfff7d6, lx + sx * 9.27, 1.85, 0, { cls: "glow" });
    const bx = lx + sx * 6.2;
    k.add(BOX(4.6, 0.6, 2.4), D, bx, 0.8, 0);
    for (const dx of [-1.6, 0, 1.6]) for (const sz of [-1, 1]) k.add(CYL(0.5, 0.5, 0.14, 14), 0x2f3338, bx + dx, 0.9, sz * 0.72, { rx: Math.PI / 2, cls: "metal", thr: 40 });
  }
  for (let i = -3; i <= 3; i++) k.add(BOX(1.2, 1.0, 0.04), 0x2b5d44, lx + i * 2, 3.0, 1.47, { edge: false });
  k.build(train.g);
  const sign = signMesh(6, 0.8, (g, w, h) => textFill(g, "X8201 次", w / 2, h / 2, h * 0.7, "#fff"), { transparent: true });
  sign.position.set(lx, 3.8, 1.48);
  train.g.add(sign);
  pickable(train.g, "train");
  // 另一股道停着的车辆
  const other = new THREE.Group();
  other.position.z = RAIL2_Z;
  const ol = [];
  for (let i = 0; i < 7; i++) {
    const x = -250 + i * 14.6;
    buildWagon(other, x);
    if (i % 3 !== 1) ol.push({ x, y: WAGON_TOP + CH / 2, z: 0, color: pickColor(), brand: pickBrand() });
  }
  buildStacks(other, ol);
  world.add(other);
  pickable(other, "train");
}
const rmg = new RTG(-135, RMG_Z, "RMG 门吊", "rmg", 0x2f7fd1);
const itruck = new Truck("yard", 0xf5a524, "itruck");
const etruck = new Truck("road", 0xc8372d, "etruck");
const impBox = makeBox(0xe8870e, "HAIYUN", IMP_NUM);
const expBox = makeBox(0x1f9d55, "OCEANIX", EXP_NUM);
pickable(impBox, "impBox");
pickable(expBox, "expBox");
// 目标箱上方的指示箭头（上下浮动）
function marker(box, color) {
  const g = new THREE.Group();
  const k = new Kit();
  k.add(new THREE.ConeGeometry(0.9, 1.6, 4), color, 0, 0, 0, { rx: Math.PI, cls: "glow" });
  k.add(CYL(0.28, 0.28, 1.4, 8), color, 0, 1.4, 0, { cls: "glow" });
  k.build(g, { cast: false });
  g.position.y = CH / 2 + 2.6;
  box.add(g);
  return g;
}
const markers = [marker(impBox, 0xf59e0b), marker(expBox, 0x22c55e)];
// 出口箱在船上的计划箱位（虚框）
const ghost = (() => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(CGEO, new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.25, depthWrite: false }));
  const l = new THREE.LineSegments(CEDGE, new THREE.LineBasicMaterial({ color: 0x16a34a }));
  g.add(m, l);
  g.position.set(0, shipY(3), shipRowZ(8));
  ship.g.add(g);
  g.visible = false;
  return g;
})();

// 静态“背景作业”用的箱子与集卡
const ambBoxL = makeBox(0x3565a8, "OCEANIX", "");
const ambBoxR = makeBox(0xc0473b, "HAIYUN", "");
const ambBoxB = makeBox(0x3f8a5c, "HAIYUN", "");
const truckL = new Truck("yard", 0xf5a524, "itruck");
const truckR = new Truck("yard", 0xf5a524, "itruck");
const LP = new Path([[-70, 14], [-39, 14]]), RP = new Path([[8, 18], [39, 18]]);
truckL.place(LP, LP.L);
truckR.place(RP, RP.L);
const loopers = [
  { t: new Truck("yard", 0xf5a524, "itruck"), d: 0, box: makeBox(0xaab2bb, "OCEANIX", "") },
  { t: new Truck("road", 0x2563eb, "etruck"), d: P.ambLoop.L * 0.5, box: null },
];
for (const l of loopers) {
  l.t.place(P.ambLoop, l.d);
  if (l.box) holdBy(l.box, l.t.trailer, 0, DECK + CH / 2, 0);
}

function holdBy(box, parent, x, y, z) {
  parent.add(box);
  box.position.set(x, y, z);
  box.rotation.set(0, 0, 0);
  box.visible = true;
}
const onTruck = (box, t) => holdBy(box, t.trailer, 0, DECK + CH / 2, 0);
const onSpreader = (box, h) => holdBy(box, h.spreader, 0, -CH / 2, 0);
const LOC = {
  impShip: () => holdBy(impBox, ship.g, 0, shipY(3), shipRowZ(9)),
  expShip: () => holdBy(expBox, ship.g, 0, shipY(3), shipRowZ(8)),
  impYard: () => holdBy(impBox, world, 0, yardY(2), YA + 2.5),
  expYard: () => holdBy(expBox, world, 0, yardY(1), YA - 2.5),
  impWagon: () => holdBy(impBox, train.g, WAGON_X, WAGON_TOP + CH / 2, 0),
};
function hide(box) {
  world.add(box);
  box.visible = false;
}

// ---------- 起重机动作 ----------
function hoistTo(S, h, y, speed = 9) {
  const y0 = h.hy;
  return S.tween(Math.max(0.35, Math.abs(y - y0) / speed), (k) => h.set(h.tz, lerp(y0, y, k)));
}
function trolleyTo(S, h, z, speed = 11) {
  const z0 = h.tz;
  return S.tween(Math.max(0.35, Math.abs(z - z0) / speed), (k) => h.set(lerp(z0, z, k), h.hy));
}
function gantryTo(S, r, x, speed = 5) {
  const x0 = r.x;
  return S.tween(Math.max(0.4, Math.abs(x - x0) / speed), (k) => r.setX(lerp(x0, x, k)));
}
// 吊具从 fromZ 处（箱顶高 fromTop）抓箱，放到 toZ 处（箱顶高 toTop）
async function transfer(S, h, box, fromZ, fromTop, toZ, toTop, travel, drop, guard) {
  await Promise.all([trolleyTo(S, h, fromZ), hoistTo(S, h, travel)]);
  if (guard) await guard("pick");
  await hoistTo(S, h, fromTop);
  await S.wait(0.45);
  h.lamp(true);
  onSpreader(box, h);
  await S.wait(0.35);
  await hoistTo(S, h, travel);
  await trolleyTo(S, h, toZ);
  if (guard) await guard("drop");
  await hoistTo(S, h, toTop);
  await S.wait(0.35);
  h.lamp(false);
  drop();
  await S.wait(0.35);
  await hoistTo(S, h, travel);
}
function drive(S, t, path, v = 14, from = 0, to = path.L) {
  return S.tween(Math.abs(to - from) / v + 0.8, (k) => t.place(path, lerp(from, to, k)));
}
function barrier(S, i, up) {
  const a0 = gate.arm[i].rotation.z, a1 = up ? Math.PI * 0.46 : 0;
  gate.lamp[i].red.color.set(up ? 0x3a1f1f : 0xef4444);
  gate.lamp[i].green.color.set(up ? 0x22c55e : 0x1f3a2a);
  return S.tween(1.1, (k) => (gate.arm[i].rotation.z = lerp(a0, a1, k)));
}
function gateReset() {
  for (let i = 0; i < 2; i++) {
    gate.arm[i].rotation.z = 0;
    gate.lamp[i].red.color.set(0xef4444);
    gate.lamp[i].green.color.set(0x1f3a2a);
    gate.flashMat[i].color.set(0x475569);
  }
}
async function gateCheck(S, i, items) {
  gate.flashMat[i].color.set(0xfef3c7);
  await S.wait(0.5);
  gate.flashMat[i].color.set(0x475569);
  for (const t of items) {
    await S.wait(0.85);
    badge(t);
  }
  await S.wait(0.8);
  await barrier(S, i, true);
}

// ---------- 提示牌（跟随 3D 位置） ----------
const badgesEl = $("badges");
let badgeAnchor = null;
function badge(txt, cls = "") {
  const d = document.createElement("div");
  d.textContent = txt;
  if (cls) d.className = cls;
  badgesEl.appendChild(d);
}
function clearBadges(anchor = null) {
  badgesEl.innerHTML = "";
  badgeAnchor = anchor;
}

// ---------- 流程步骤 ----------
const impTop = shipY(3) + CH / 2;
const wz = (r) => SHIP_Z + shipRowZ(r);
function base() {
  ship.setX(0);
  crane.set(10, 30);
  crane.lamp(false);
  rtgA.setX(13);
  rtgA.set(0, 17);
  rtgA.lamp(false);
  rmg.setX(-135);
  rmg.set(0, 17);
  rmg.lamp(false);
  train.setX(0);
  itruck.g.visible = etruck.g.visible = true;
  gateReset();
  ghost.visible = false;
  clearBadges();
}
const boxPos = (b) => () => b.getWorldPosition(V3()).add(V3(0, 3, 0));
const truckPos = (t) => () => t.topWorld();
// 镜头：固定机位 {pos, tgt}，或跟随 {follow: ()=>Vector3, off}
const IMP = [
  {
    short: "船舶靠泊", title: "船舶靠泊",
    text: "集装箱船在引航员和拖轮协助下靠上泊位，带好缆绳。开工前，码头按船公司发来的积载图确定要卸哪些箱子，工人拆除箱子的绑扎。",
    points: ["岸桥移到要作业的贝位上方待命", "卸船顺序：一般先卸甲板上层，再卸下层和舱内"],
    where: "进口箱 " + IMP_NUM + " 在船上：<b>18 贝 09 列 88 层</b>（甲板最上层）",
    equip: ["ship", "sts"],
    cam: { pos: [-95, 55, -120], tgt: [10, 6, -18] },
    pre() {
      base();
      ship.setX(190);
      LOC.impShip();
      hide(expBox);
      itruck.place(P.itWait, P.itWait.L);
      etruck.g.visible = false;
    },
    async run(S) {
      await S.tween(12, (k) => ship.setX(lerp(190, 0, k)), easeOut);
      await S.wait(1.2);
    },
  },
  {
    short: "岸桥卸船", title: "岸桥卸船",
    text: "岸桥小车开到船上方，吊具下降对准箱子顶部的四个角件，旋锁锁紧（指示灯变绿）后起升；小车往陆侧开，把箱子放到岸桥下等候的内集卡上，开锁后起升，准备下一关。",
    points: ["一吊一个循环大约 2 分钟，每小时 25–35 箱", "岸桥是作业链的“节拍器”：后面的集卡、场桥都要跟上它的节奏"],
    where: "进口箱：<b>船上 → 内集卡</b>",
    equip: ["sts", "itruck"],
    cam: { pos: [-34, 64, 48], tgt: [0, 8, -4] },
    pre() {
      base();
      LOC.impShip();
      hide(expBox);
      itruck.place(P.itWait, P.itWait.L);
      etruck.g.visible = false;
    },
    async run(S) {
      await transfer(S, crane, impBox, wz(9), impTop, 10, TRUCK_TOP, 30, () => onTruck(impBox, itruck));
      await S.wait(0.6);
    },
  },
  {
    short: "内集卡运到堆场", title: "内集卡水平运输",
    text: "内集卡按码头操作系统（TOS）发来的指令，把箱子从码头前沿拉到堆场的进口箱区，停在场桥下的车道上。码头前沿和堆场之间的这段运输叫“水平运输”。",
    points: ["内集卡只在港区里跑，车辆编号由系统统一调度", "集卡派得太少，岸桥就要停下来等车"],
    where: "进口箱：<b>内集卡上</b>，前往 A 区 18 贝",
    equip: ["itruck", "yard"],
    cam: { follow: truckPos(itruck), off: [26, 24, -26] },
    pre() {
      base();
      onTruck(impBox, itruck);
      hide(expBox);
      itruck.place(P.itToYard, 0);
      etruck.g.visible = false;
    },
    async run(S) {
      await drive(S, itruck, P.itToYard, 15);
      await S.wait(0.5);
    },
  },
  {
    short: "场桥卸车堆存", title: "场桥卸车、进场堆存",
    text: "场桥开到指定贝位，把箱子从内集卡上吊起，放到计划好的箱位上。内集卡卸完后空车返回码头前沿，继续接下一个箱子。",
    points: ["箱位用“箱区—贝—排—层”表示，这个箱放在 A 区 18 贝 4 排 3 层", "进口箱按提箱计划堆放：先提的放上面，减少翻箱"],
    where: "进口箱：<b>内集卡 → 堆场 A-18-04-3</b>",
    equip: ["rtg", "yard", "itruck"],
    cam: { pos: [42, 34, 32], tgt: [2, 6, 66] },
    pre() {
      base();
      onTruck(impBox, itruck);
      hide(expBox);
      itruck.place(P.itToYard, P.itToYard.L);
      etruck.g.visible = false;
    },
    async run(S) {
      await gantryTo(S, rtgA, 0);
      await transfer(S, rtgA, impBox, LANE_A - YA, TRUCK_TOP, 2.5, yardTop(2), 17, () => LOC.impYard());
      await drive(S, itruck, P.itLeave, 12);
    },
  },
  {
    short: "办理放行与预约", title: "办理放行与提箱预约",
    text: "箱子在堆场里等待提货。收货人或代理要办完这些手续：海关放行、换取提货单、缴清港口费用，然后在港口系统里预约提箱时间段。",
    points: ["手续不全的箱子，闸口不会放行", "预约制把外集卡分散到不同时段，减少闸口排队"],
    where: "进口箱：<b>堆场 A-18-04-3</b>，等待提货",
    equip: ["yard", "office"],
    cam: { pos: [26, 20, 52], tgt: [0, 6, 72] },
    pre() {
      base();
      rtgA.setX(0);
      LOC.impYard();
      hide(expBox);
      itruck.place(P.itLeave, P.itLeave.L);
      etruck.g.visible = false;
      clearBadges(boxPos(impBox));
    },
    async run(S) {
      for (const t of ["海关放行 ✓", "提货单（D/O）已换取 ✓", "港口费用已缴清 ✓", "提箱预约：明天 10:00–11:00 ✓"]) {
        await S.wait(1.3);
        badge(t);
      }
      await S.wait(2.5);
    },
  },
  {
    short: "外集卡进闸", title: "外集卡空车进闸",
    text: "外集卡按预约时间来到闸口，这时车上是空的板车。系统自动识别车牌、核对预约，打印作业小票，告诉司机去哪个箱区；核验通过后抬杆，集卡开到箱子所在的场桥下。",
    points: ["智能闸口：车牌识别 + 预约核验，几十秒就能过闸", "没有预约或信息对不上的车，会被引导到人工车道处理"],
    where: "进口箱：<b>堆场 A-18-04-3</b>，外集卡前来提箱",
    equip: ["gate", "etruck"],
    cam: { follow: truckPos(etruck), off: [30, 22, 22] },
    pre() {
      base();
      rtgA.setX(0);
      LOC.impYard();
      hide(expBox);
      itruck.place(P.itLeave, P.itLeave.L);
      etruck.place(P.etIn, 0);
      clearBadges(() => V3(83, 6, 145.5));
    },
    async run(S) {
      await drive(S, etruck, P.etIn, 16);
      await gateCheck(S, 0, ["车牌识别 沪A·D3721 ✓", "提箱预约核验 ✓", "作业小票：去 A 区 18 贝"]);
      clearBadges();
      await Promise.all([drive(S, etruck, P.etToYard, 15), S.wait(3).then(() => barrier(S, 0, false))]);
    },
  },
  {
    short: "场桥装车", title: "场桥给外集卡装车",
    text: "场桥把箱子从箱位上吊起，装到外集卡的板车上，司机下车扣好四个角的旋锁。",
    points: ["如果箱子上面还压着别的箱子，要先把上面的箱子挪走（翻箱），既费时又费钱", "所以堆存时就要考虑提箱顺序"],
    where: "进口箱：<b>堆场 → 外集卡</b>",
    equip: ["rtg", "etruck"],
    cam: { pos: [42, 34, 32], tgt: [2, 6, 66] },
    pre() {
      base();
      rtgA.setX(0);
      rtgA.set(2.5, 17);
      LOC.impYard();
      hide(expBox);
      itruck.place(P.itLeave, P.itLeave.L);
      etruck.place(P.etToYard, P.etToYard.L);
    },
    async run(S) {
      await transfer(S, rtgA, impBox, 2.5, yardTop(2), LANE_A - YA, TRUCK_TOP, 17, () => onTruck(impBox, etruck));
      await S.wait(0.6);
    },
  },
  {
    short: "外集卡出闸", title: "外集卡重车出闸",
    text: "外集卡开到出港车道。闸口识别箱号、检查箱体有无破损、核对铅封，确认和提货信息一致后抬杆放行，箱子离开港区，送往收货人。",
    points: ["出闸检查：箱号、箱体、铅封、单证", "设备交接单（EIR）记录交接时箱子的状况，出了问题分得清责任"],
    where: "进口箱：<b>外集卡上</b>，出港送往收货人",
    equip: ["gate", "etruck"],
    cam: { follow: truckPos(etruck), off: [-24, 24, -30] },
    pre() {
      base();
      rtgA.setX(0);
      onTruck(impBox, etruck);
      hide(expBox);
      itruck.place(P.itLeave, P.itLeave.L);
      etruck.place(P.etToOut, 0);
      clearBadges(() => V3(90, 6, 155.5));
    },
    async run(S) {
      await drive(S, etruck, P.etToOut, 20);
      await gateCheck(S, 1, ["箱号识别 " + IMP_NUM + " ✓", "箱体检查：无破损 ✓", "铅封完好 ✓", "放行"]);
      clearBadges();
      await Promise.all([drive(S, etruck, P.etOut, 14), S.wait(3).then(() => barrier(S, 1, false))]);
    },
  },
];
const EXP = [
  {
    short: "集港预约、报 VGM", title: "集港预约、申报 VGM",
    text: "出口箱在工厂或场站装好货、施加铅封后，货代凭订舱信息在港口系统里预约进港时间，并申报这个箱子的核实总重（VGM）。港口只在截港之前的几天里接收这条船的出口箱，这叫“集港”。",
    points: ["截港时间一到就不再收箱，没进港的箱子赶不上这条船", "VGM 不申报，箱子不能装船"],
    where: "出口箱 " + EXP_NUM + "：<b>外集卡上</b>，在港外准备进港",
    equip: ["etruck", "office"],
    cam: { pos: [122, 18, 292], tgt: [86, 4, 258] },
    pre() {
      base();
      hide(impBox);
      onTruck(expBox, etruck);
      etruck.place(P.etIn, 0);
      itruck.place(P.itArrive, 0);
      clearBadges(truckPos(etruck));
    },
    async run(S) {
      for (const t of ["订舱号 HY2609-0381 ✓", "进港预约：今天 14:00–15:00 ✓", "VGM 核实总重 26.4 吨 ✓"]) {
        await S.wait(1.3);
        badge(t);
      }
      await S.wait(2.5);
    },
  },
  {
    short: "重箱进闸", title: "外集卡重箱进闸",
    text: "外集卡拉着重箱到闸口：识别车牌和箱号，过地磅称重，检查箱体和铅封，核对预约和单证。通过后抬杆，系统给这个箱子分配堆场箱位。",
    points: ["地磅称出的重量要和申报的 VGM 对得上", "进闸时箱子有破损要当场记录在设备交接单上"],
    where: "出口箱：<b>外集卡上</b>，进港",
    equip: ["gate", "etruck"],
    cam: { follow: truckPos(etruck), off: [30, 22, 22] },
    pre() {
      base();
      hide(impBox);
      onTruck(expBox, etruck);
      etruck.place(P.etIn, 0);
      itruck.place(P.itArrive, 0);
      clearBadges(() => V3(83, 6, 145.5));
    },
    async run(S) {
      await drive(S, etruck, P.etIn, 16);
      await gateCheck(S, 0, ["箱号识别 " + EXP_NUM + " ✓", "地磅称重 42.1 吨（含车）✓", "铅封、箱体检查 ✓", "分配箱位 A-18-02-2"]);
      clearBadges();
      await Promise.all([drive(S, etruck, P.etToYard, 15), S.wait(3).then(() => barrier(S, 0, false))]);
    },
  },
  {
    short: "场桥收箱堆存", title: "场桥收箱、进场堆存",
    text: "场桥把重箱从外集卡上吊下，放到出口箱区的指定箱位。外集卡卸完后空车出港。",
    points: ["出口箱按船名、卸货港、重量等级分开堆放", "这样装船时能按顺序一个个取出来，不用翻箱"],
    where: "出口箱：<b>外集卡 → 堆场 A-18-02-2</b>",
    equip: ["rtg", "yard", "etruck"],
    cam: { pos: [42, 34, 32], tgt: [2, 6, 66] },
    pre() {
      base();
      hide(impBox);
      onTruck(expBox, etruck);
      etruck.place(P.etToYard, P.etToYard.L);
      itruck.place(P.itArrive, 0);
    },
    async run(S) {
      await gantryTo(S, rtgA, 0);
      await transfer(S, rtgA, expBox, LANE_A - YA, TRUCK_TOP, -2.5, yardTop(1), 17, () => LOC.expYard());
      await drive(S, etruck, P.etToOut, 14, 0, 80);
    },
  },
  {
    short: "制作配载图", title: "配载：确定船上的箱位",
    text: "船到港前，配载员根据订舱清单做积载计划（配载图），确定每个出口箱装在船上的哪个位置。这个箱子被安排在 18 贝 07 列 88 层（绿色虚框）。",
    points: ["重箱在下、轻箱在上，保证船舶稳性", "先到的卸货港的箱子放在上面，到港时好卸", "兼顾装卸顺序，让岸桥少移动、少等待"],
    where: "出口箱：<b>堆场 A-18-02-2</b>，计划装到 <b>18 贝 07 列 88 层</b>",
    equip: ["ship", "office"],
    bay: true,
    cam: { pos: [40, 30, -52], tgt: [0, 12, -16] },
    pre() {
      base();
      rtgA.setX(0);
      hide(impBox);
      LOC.expYard();
      etruck.g.visible = false;
      itruck.place(P.itArrive, 0);
      ghost.visible = true;
      clearBadges(() => ghost.getWorldPosition(V3()).add(V3(0, 3, 0)));
    },
    async run(S) {
      await S.wait(1);
      badge("计划箱位：18 贝 07 列 88 层", "info");
      await S.wait(6);
    },
  },
  {
    short: "场桥发箱", title: "场桥给内集卡发箱",
    text: "开始装船后，内集卡按装船顺序开到场桥下，场桥把这个出口箱装到内集卡上。",
    points: ["发箱顺序由配载图决定，必须和岸桥的装船顺序一致", "顺序乱了，岸桥就要等箱"],
    where: "出口箱：<b>堆场 → 内集卡</b>",
    equip: ["rtg", "itruck"],
    cam: { pos: [42, 34, 32], tgt: [2, 6, 66] },
    pre() {
      base();
      rtgA.setX(0);
      rtgA.set(-2.5, 17);
      hide(impBox);
      LOC.expYard();
      etruck.g.visible = false;
      itruck.place(P.itArrive, 0);
      ghost.visible = true;
    },
    async run(S) {
      await drive(S, itruck, P.itArrive, 12);
      await transfer(S, rtgA, expBox, -2.5, yardTop(1), LANE_A - YA, TRUCK_TOP, 17, () => onTruck(expBox, itruck));
      await S.wait(0.5);
    },
  },
  {
    short: "内集卡运到前沿", title: "内集卡水平运输到码头前沿",
    text: "内集卡把箱子拉到码头前沿，停在对应岸桥下的作业车道上，等岸桥来吊。",
    points: ["岸桥下通常有好几条车道，集卡按指令停到指定车道", "集卡要提前到位，岸桥才不会等车"],
    where: "出口箱：<b>内集卡上</b>，前往 QC 03 岸桥",
    equip: ["itruck", "sts"],
    cam: { follow: truckPos(itruck), off: [26, 24, 28] },
    pre() {
      base();
      rtgA.setX(0);
      hide(impBox);
      onTruck(expBox, itruck);
      etruck.g.visible = false;
      itruck.place(P.itToQuay, 0);
      ghost.visible = true;
    },
    async run(S) {
      await drive(S, itruck, P.itToQuay, 15);
      await S.wait(0.5);
    },
  },
  {
    short: "岸桥装船", title: "岸桥装船",
    text: "岸桥把箱子从内集卡上吊起，小车开向海侧，对准配载图上的箱位放下。箱子装好后，绑扎工人用绑扎杆和旋锁把它固定住。",
    points: ["装船顺序和卸船相反：先装舱内和下层，再装上层", "装完一个贝位要和理货核对一次"],
    where: "出口箱：<b>内集卡 → 船上 18 贝 07 列 88 层</b>",
    equip: ["sts", "ship"],
    cam: { pos: [-34, 64, 48], tgt: [0, 8, -4] },
    pre() {
      base();
      rtgA.setX(0);
      hide(impBox);
      onTruck(expBox, itruck);
      etruck.g.visible = false;
      itruck.place(P.itToQuay, P.itToQuay.L);
      ghost.visible = true;
    },
    async run(S) {
      await transfer(S, crane, expBox, 10, TRUCK_TOP, wz(8), impTop, 30, () => {
        LOC.expShip();
        ghost.visible = false;
      });
      await S.wait(0.6);
    },
  },
  {
    short: "船舶离港", title: "船舶离港",
    text: "所有出口箱装完、绑扎完毕后，船方和码头核对装船清单，办完出港手续，船舶解缆，在拖轮协助下离开泊位。",
    points: ["一条船从靠泊到离港，码头要在几十个小时内完成上千个箱子的装卸", "效率取决于整条作业链里最慢的一环"],
    where: "出口箱：<b>船上 18 贝 07 列 88 层</b>，随船出口",
    equip: ["ship"],
    cam: { pos: [-60, 55, -130], tgt: [40, 6, -20] },
    pre() {
      base();
      rtgA.setX(0);
      hide(impBox);
      LOC.expShip();
      etruck.g.visible = false;
      itruck.place(P.itToQuay, P.itToQuay.L);
    },
    async run(S) {
      await S.wait(1.2);
      await S.tween(13, (k) => ship.setX(lerp(0, 230, k)), easeIn);
    },
  },
];
// 海铁联运换装：船 → 岸桥 → 堆场 → 集卡短驳 → 门吊装车 → 加固 → 班列发运
const RAIL = [
  {
    short: "岸桥卸船", title: "岸桥卸船",
    text: "集装箱船靠泊后，岸桥把这个要转铁路的箱子从船上卸下，放到岸桥下等候的内集卡上。它的下一程是铁路班列，这种“海运 + 铁路”的组合叫海铁联运。",
    points: ["到港前，船公司和场站已经收到到达预报：箱号、箱型、重量、铅封号、下一程班列", "赶班列的箱子优先卸船"],
    where: "海铁联运箱 " + IMP_NUM + "：<b>船上 → 内集卡</b>",
    equip: ["sts", "itruck"],
    cam: { pos: [-34, 64, 48], tgt: [0, 8, -4] },
    pre() { IMP[1].pre(); },
    run: (S) => IMP[1].run(S),
  },
  {
    short: "内集卡运到堆场", title: "内集卡水平运输到堆场",
    text: "内集卡把箱子从码头前沿拉到堆场，停在场桥下的车道上。",
    points: ["如果班列就在旁边等着，也可以不进堆场，直接用集卡送到铁路装卸线装车，这叫“直取”", "直取省掉一次落地和吊装，但对时间衔接要求很高"],
    where: "海铁联运箱：<b>内集卡上</b>，前往 A 区 18 贝",
    equip: ["itruck", "yard"],
    cam: { follow: truckPos(itruck), off: [26, 24, -26] },
    pre() { IMP[2].pre(); },
    run: (S) => IMP[2].run(S),
  },
  {
    short: "场桥卸车堆存", title: "场桥卸车、落地堆存",
    text: "场桥把箱子吊下，放到堆场里等待装火车的箱位上（A 区 18 贝 4 排 3 层）。同一趟班列的箱子集中堆放，装车时按顺序取。",
    points: ["先装车的箱子放在上层，减少翻箱", "堆存期间核对箱号、铅封和箱体外观，异常当场记录"],
    where: "海铁联运箱：<b>内集卡 → 堆场 A-18-04-3</b>",
    equip: ["rtg", "yard"],
    cam: { pos: [42, 34, 32], tgt: [2, 6, 66] },
    pre() { IMP[3].pre(); },
    run: (S) => IMP[3].run(S),
  },
  {
    short: "场桥发箱装集卡", title: "按装车计划发箱",
    text: "班列到场前，场站按铁路装车计划排好顺序。集卡开到场桥下，场桥把这个箱子装上集卡，准备短驳到铁路装卸线。",
    points: ["装车计划写明：哪趟班列、哪股道、第几辆平车", "场站设备要提前指派：场桥负责堆场取箱，门吊或正面吊负责装火车"],
    where: "海铁联运箱：<b>堆场 → 内集卡</b>，计划装 X8201 次第 3 辆平车",
    equip: ["rtg", "itruck"],
    cam: { pos: [42, 34, 32], tgt: [2, 6, 66] },
    pre() {
      base();
      rtgA.setX(0);
      rtgA.set(2.5, 17);
      LOC.impYard();
      hide(expBox);
      itruck.place(P.itArrive, 0);
      etruck.g.visible = false;
      clearBadges(boxPos(impBox));
    },
    async run(S) {
      badge("装车计划：X8201 次 · 1 道 · 第 3 辆平车", "info");
      await drive(S, itruck, P.itArrive, 12);
      await transfer(S, rtgA, impBox, 2.5, yardTop(2), LANE_A - YA, TRUCK_TOP, 17, () => onTruck(impBox, itruck));
      await S.wait(0.5);
    },
  },
  {
    short: "集卡短驳到铁路线", title: "集卡短驳到铁路装卸线",
    text: "集卡把箱子从堆场拉到铁路装卸线，停在门吊下面的车道上。这段港内短距离转运叫“短驳”。",
    points: ["短驳时间要算进全程时刻表：晚了就赶不上班列", "到达装卸线时核对车次、股道和平车号"],
    where: "海铁联运箱：<b>集卡上</b>，前往铁路装卸线",
    equip: ["itruck", "rmg"],
    cam: { follow: truckPos(itruck), off: [18, 26, 30] },
    pre() {
      base();
      rtgA.setX(0);
      onTruck(impBox, itruck);
      hide(expBox);
      itruck.place(P.toRail, 0);
      etruck.g.visible = false;
    },
    async run(S) {
      await drive(S, itruck, P.toRail, 15);
      await S.wait(0.5);
    },
  },
  {
    short: "门吊装上平车", title: "门吊把箱子装上铁路平车",
    text: "门吊开到这辆平车上方，吊起集卡上的箱子，小车移到铁轨上方，把箱子对准平车的四个锁头放下。",
    points: ["40 尺箱放在平车中间，四个角落进锁头", "没有门吊的场站用正面吊装车，更灵活但效率低一些"],
    where: "海铁联运箱：<b>集卡 → 铁路平车</b>",
    equip: ["rmg", "train"],
    cam: { pos: [-112, 30, 44], tgt: [-150, 4, 76] },
    pre() {
      base();
      rtgA.setX(0);
      onTruck(impBox, itruck);
      hide(expBox);
      itruck.place(P.toRail, P.toRail.L);
      etruck.g.visible = false;
    },
    async run(S) {
      await gantryTo(S, rmg, WAGON_X);
      await transfer(S, rmg, impBox, RAIL_LANE - RMG_Z, TRUCK_TOP, RAIL_Z - RMG_Z, WAGON_TOP + CH, 17, () => LOC.impWagon());
      await S.wait(0.5);
    },
  },
  {
    short: "加固检查", title: "加固与装车检查",
    text: "箱子落位后，检查四个角的锁头是否锁闭到位，核对箱号、铅封，确认箱门朝向和装载位置符合要求，填写装车记录。空集卡返回堆场。",
    points: ["锁头没锁好，列车运行中箱子可能移位甚至坠落", "加固检查合格后，这辆平车才能编进班列"],
    where: "海铁联运箱：<b>X8201 次第 3 辆平车</b>",
    equip: ["train", "rmg"],
    cam: { pos: [-132, 12, 60], tgt: [-150, 2.5, 79] },
    pre() {
      base();
      rtgA.setX(0);
      rmg.setX(WAGON_X);
      LOC.impWagon();
      hide(expBox);
      itruck.place(P.toRail, P.toRail.L);
      etruck.g.visible = false;
      clearBadges(boxPos(impBox));
    },
    async run(S) {
      const leave = quiet(drive(S, itruck, P.railLeave, 10));
      for (const t of ["四角锁头锁闭 ✓", "箱号、铅封核对 ✓", "装载位置、偏载检查 ✓", "装车记录已上传 ✓"]) {
        await S.wait(1.2);
        badge(t);
      }
      await leave;
      await S.wait(1.5);
    },
  },
  {
    short: "班列发运", title: "班列发运",
    text: "整列车装完、检查合格后，班列按时刻表发车，箱子沿铁路运往内陆（例如重庆）。到站后再由集卡送到收货人手里，一票货完成了“船 → 铁路 → 公路”的全程联运。",
    points: ["反方向同样适用：内陆班列到港 → 卸车 → 堆场 → 岸桥装船", "换装环节环环相扣：任何一环慢了，箱子就赶不上下一程"],
    where: "海铁联运箱：<b>随 X8201 次班列发运</b>",
    equip: ["train"],
    cam: { pos: [-110, 42, 36], tgt: [-210, 2, 80] },
    pre() {
      base();
      rtgA.setX(0);
      rmg.setX(WAGON_X);
      LOC.impWagon();
      hide(expBox);
      itruck.place(P.railLeave, P.railLeave.L);
      etruck.g.visible = false;
      clearBadges();
    },
    async run(S) {
      await S.wait(1);
      await S.tween(14, (k) => train.setX(lerp(0, -330, k)), easeIn);
    },
  },
];
const FLOWS = { imp: IMP, exp: EXP, rail: RAIL };
const FLOW_NAME = { imp: "进口", exp: "出口", rail: "海铁换装" };

// ---------- 镜头 ----------
let camGoal = null, autoCam = true;
const _cp = V3(), _ct = V3();
function goalNow() {
  if (!camGoal) return null;
  if (camGoal.follow) {
    const t = camGoal.follow();
    return [_cp.copy(t).add(V3(...camGoal.off)), _ct.copy(t)];
  }
  return [_cp.set(...camGoal.pos), _ct.set(...camGoal.tgt)];
}
function setAutoCam(on) {
  autoCam = on;
  $("camBtn").classList.toggle("on", on);
}
controls.addEventListener("start", () => setAutoCam(false));
const OVERVIEW = { pos: [-150, 150, -95], tgt: [15, 0, 70] };

// ---------- 流程控制 ----------
let mode = "imp", stepIdx = 0, playing = true, speed = 1, autoNext = true, runId = 0;
const seen = { imp: new Set(), exp: new Set(), rail: new Set() };
function steps() { return FLOWS[mode]; }
function goStep(i) {
  const st = steps();
  i = Math.max(0, Math.min(st.length - 1, i));
  main.cancel();
  stepIdx = i;
  const s = st[i];
  s.pre();
  camGoal = s.cam;
  setAutoCam(true);
  renderFlow();
  $("nextBtn").classList.remove("next-hint");
  const id = ++runId;
  quiet(
    s.run(main).then(async () => {
      if (id !== runId) return;
      seen[mode].add(i);
      renderFlow();
      if (i === st.length - 1) return flowDone();
      if (autoNext) {
        await main.wait(1.4);
        if (id === runId) goStep(i + 1);
      } else $("nextBtn").classList.add("next-hint");
    })
  );
}
function flowDone() {
  const next = { imp: "exp", exp: "rail", rail: "imp" }[mode];
  const route = {
    imp: "箱子经过 船 → 岸桥 → 内集卡 → 场桥 → 堆场 → 外集卡 → 闸口，离开了码头。",
    exp: "箱子经过 闸口 → 外集卡 → 场桥 → 堆场 → 内集卡 → 岸桥 → 船，出口了。",
    rail: "箱子经过 船 → 岸桥 → 堆场 → 集卡短驳 → 门吊 → 铁路平车 → 班列，完成了海铁换装。",
  }[mode];
  showModal(`
    <h2>${FLOW_NAME[mode]}流程看完了</h2>
    <p>${route}</p>
    <p>可以接着看${FLOW_NAME[next]}流程，对比同样的设备在不同流程里的顺序。看完后去“练习”检验一下。</p>
    <div class="acts">
      <button class="btn" data-act="replay">再看一遍</button>
      <button class="btn" data-act="${next}">看${FLOW_NAME[next]}流程</button>
      <button class="btn primary" data-act="prac">去练习</button>
    </div>`);
}
function renderFlow() {
  const st = steps();
  $("steps").innerHTML = st.map((s, i) => `<li data-i="${i}" class="${i === stepIdx ? "on" : ""} ${seen[mode].has(i) ? "done" : ""}"><i>${i + 1}</i>${s.short}</li>`).join("");
  const s = st[stepIdx];
  $("stepCard").innerHTML = `<h2>${s.title}<small>${FLOW_NAME[mode]} ${stepIdx + 1}/${st.length}</small></h2><p>${s.text}</p><ul>${s.points.map((p) => `<li>${p}</li>`).join("")}</ul>${s.bay ? bayPlanHtml() : ""}`;
  $("where").innerHTML = "📦 " + s.where;
  $("equip").innerHTML = s.equip.map((k) => `<button data-k="${k}">${INFO[k][0].replace(/（.*）/, "")}</button>`).join("");
  $("prevBtn").disabled = stepIdx === 0;
  $("nextBtn").disabled = stepIdx === st.length - 1;
}
// 18 贝甲板贝位图
function bayPlanHtml() {
  const rowsOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 左舷 → 右舷（靠码头）
  const rowNo = (r) => (r >= 5 ? String(1 + (r - 5) * 2).padStart(2, "0") : String(2 + (4 - r) * 2).padStart(2, "0"));
  let h = `<table class="bay"><tr><th></th>${rowsOrder.map((r) => `<th>${rowNo(r)}</th>`).join("")}</tr>`;
  for (let t = 5; t >= 0; t--) {
    h += `<tr><th>${82 + t * 2}</th>`;
    for (const r of rowsOrder) {
      const filled = t < shipH[0][r];
      const target = r === 8 && t === 3;
      h += `<td class="${target ? "t" : filled ? "f" : ""}">${target ? "★" : ""}</td>`;
    }
    h += "</tr>";
  }
  return h + `</table><div class="baycap">18 贝甲板贝位图（灰色已有箱，★ 为本箱计划位置；右侧靠码头）</div>`;
}
function setMode(m) {
  mode = m;
  document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  document.body.classList.toggle("practice", m === "prac");
  impLabel.textContent = (m === "rail" ? "海铁联运箱 " : "进口箱 ") + IMP_NUM;
  updateLabels();
  if (m === "prac") {
    main.cancel();
    runId++;
    base();
    LOC.impShip();
    LOC.expYard();
    itruck.place(P.itWait, P.itWait.L);
    etruck.place(P.etIn, 0);
    camGoal = { pos: [-120, 120, -40], tgt: [20, 0, 60] };
    setAutoCam(true);
    renderPractice();
    return;
  }
  seen[m] = seen[m] || new Set();
  goStep(0);
}
function setPlaying(p) {
  playing = p;
  $("playBtn").textContent = p ? "暂停" : "播放";
}

// ---------- 标签 ----------
const labelsEl = $("labels");
const labels = [];
function addLabel(text, cls, get, show = () => true) {
  const el = document.createElement("div");
  el.className = "lbl " + cls;
  el.textContent = text;
  labelsEl.appendChild(el);
  return el;
  labels.push({ el, get, show });
}
addLabel("集装箱船", "", () => ship.g.localToWorld(V3(-58, 30, 0)));
addLabel("岸桥 QC 03", "", () => V3(0, 66, 22));
addLabel("场桥 RTG", "", () => rtgA.g.localToWorld(V3(0, 25, 0)));
addLabel("堆场 A 区（进出口箱区）", "", () => V3(-40, 13, YA));
addLabel("闸口", "", () => V3(90, 10, 151));
addLabel("集装箱货运站", "", () => V3(-40, 13, 143));
addLabel("铁路装卸线 · 门吊", "", () => rmg.g.localToWorld(V3(0, 25, 0)));
addLabel("班列", "", () => train.g.localToWorld(V3(WAGON_X - 36, 6, 0)));
addLabel("内集卡", "", truckPos(itruck), () => itruck.g.visible && mode !== "prac");
addLabel("外集卡", "", truckPos(etruck), () => etruck.g.visible && mode !== "prac");
const impLabel = addLabel("进口箱 " + IMP_NUM, "box", () => impBox.getWorldPosition(V3()).add(V3(0, 6.2, 0)), () => impBox.visible);
addLabel("出口箱 " + EXP_NUM, "box exp", () => expBox.getWorldPosition(V3()).add(V3(0, 6.2, 0)), () => expBox.visible);
function updateLabels() {}
const _lp = V3();
function placeOverlay(el, p, W, H, tf = "translate(-50%, -100%)") {
  _lp.copy(p).project(camera);
  if (_lp.z > 1 || _lp.x < -1.1 || _lp.x > 1.1 || _lp.y < -1.1 || _lp.y > 1.1) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";
  el.style.transform = `translate(${((_lp.x + 1) / 2) * W}px, ${((1 - _lp.y) / 2) * H}px) ${tf}`;
}

// ---------- 环境动效 ----------
let ambientOn = true;
const gulls = [];
{
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.35, 0, -1.2, -0.3, 0, -1.1], 3));
  wingGeo.computeVertexNormals();
  const wm = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
  const tipM = new THREE.LineBasicMaterial({ color: 0x334155 });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BOX(0.9, 0.22, 0.22), wm);
    g.add(body);
    const wings = [];
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(wingGeo, wm);
      w.scale.z = s;
      w.add(new THREE.LineSegments(new THREE.EdgesGeometry(wingGeo), tipM));
      g.add(w);
      wings.push(w);
    }
    g.scale.setScalar(1.1);
    world.add(g);
    gulls.push({ g, wings, cx: -90 + rnd() * 180, cz: -75 + rnd() * 40, r: 16 + rnd() * 24, y: 30 + rnd() * 22, sp: 0.18 + rnd() * 0.15, ph: rnd() * 6.28, dir: rnd() < 0.5 ? 1 : -1 });
  }
}
const clouds = [];
{
  const [c, g] = cvs(256, 128);
  for (let i = 0; i < 9; i++) {
    const x = 50 + rnd() * 156, y = 50 + rnd() * 30, r = 26 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,.95)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 128);
  }
  const t = toTex(c);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, opacity: 0.9 }));
    s.scale.set(220 + rnd() * 120, 80 + rnd() * 40, 1);
    s.position.set(-700 + rnd() * 1400, 170 + rnd() * 90, -500 + rnd() * 1100);
    scene.add(s);
    clouds.push(s);
  }
}
// 背景作业：两台岸桥、B 区场桥、B 区环线集卡
const docked = () => amb.until(() => ship.docked());
async function ambSTS(cr, box, bayX, truck) {
  const wzs = SHIP_Z + shipRowZ(9), shipTop = shipY(2) + CH / 2, lz = truck === truckL ? 14 : 18;
  holdBy(box, ship.g, bayX, shipY(2), shipRowZ(9));
  cr.set(lz, 30);
  await amb.wait(rnd() * 5);
  for (;;) {
    await transfer(amb, cr, box, wzs, shipTop, lz, TRUCK_TOP, 30, () => onTruck(box, truck), (w) => (w === "pick" ? docked() : null));
    await amb.wait(4 + rnd() * 3);
    await transfer(amb, cr, box, lz, TRUCK_TOP, wzs, shipTop, 30, () => holdBy(box, ship.g, bayX, shipY(2), shipRowZ(9)), (w) => (w === "drop" ? docked() : null));
    await amb.wait(3 + rnd() * 3);
  }
}
async function ambRTG() {
  const hs = yardH["B-26"];
  const top = (r, extra) => (hs[r] + extra) * CH;
  holdBy(ambBoxB, world, -26, yardY(hs[1]), YB - 2.5);
  for (;;) {
    await transfer(amb, rtgB, ambBoxB, -2.5, top(1, 1), 5, top(4, 1), 17, () => holdBy(ambBoxB, world, -26, yardY(hs[4]), YB + 5));
    await amb.wait(5);
    await transfer(amb, rtgB, ambBoxB, 5, top(4, 1), -2.5, top(1, 1), 17, () => holdBy(ambBoxB, world, -26, yardY(hs[1]), YB - 2.5));
    await amb.wait(5);
  }
}
quiet(ambSTS(craneL, ambBoxL, -39, truckL));
quiet(ambSTS(craneR, ambBoxR, 39, truckR));
quiet(ambRTG());
function ambientTick(dt, t) {
  amb.tick(dt);
  // 海浪
  const pa = water.geometry.attributes.position, b = water.userData.base;
  for (let i = 0; i < pa.count; i++) {
    const x = b[i * 3], z = b[i * 3 + 2];
    pa.array[i * 3 + 1] = b[i * 3 + 1] + 0.28 * Math.sin(x * 0.07 + t * 1.1) + 0.22 * Math.sin(z * 0.11 + t * 1.4 + x * 0.02);
  }
  pa.needsUpdate = true;
  // 旗帜
  const fa = ship.flag.geometry.attributes.position, fb = ship.flag.userData.base;
  for (let i = 0; i < fa.count; i++) {
    const x = fb[i * 3];
    fa.array[i * 3 + 2] = Math.sin(x * 2.2 - t * 6) * 0.18 * (x / 2.4);
  }
  fa.needsUpdate = true;
  ship.radar.rotation.y = t * 1.6;
  // 警示灯闪烁
  const blink = Math.sin(t * 4) > 0.3;
  for (const c of [crane, craneL, craneR]) c.warn.color.set(blink ? 0xff3b3b : 0x5b1a1a);
  const bk = Math.sin(t * 7) > 0;
  for (const r of [rtgA, rtgB]) r.beacon.color.set(bk ? 0xffb020 : 0x7a4a0a);
  // 海鸥
  for (const s of gulls) {
    const a = s.ph + t * s.sp * s.dir;
    s.g.position.set(s.cx + Math.cos(a) * s.r, s.y + Math.sin(t * 0.7 + s.ph) * 2, s.cz + Math.sin(a) * s.r);
    s.g.rotation.y = -a - (s.dir > 0 ? 0 : Math.PI);
    const f = Math.sin(t * 7 + s.ph) * 0.6;
    s.wings[0].rotation.x = f;
    s.wings[1].rotation.x = -f;
  }
  for (const c of clouds) {
    c.position.x += dt * 3;
    if (c.position.x > 800) c.position.x = -800;
  }
  // 环线集卡
  for (const l of loopers) {
    l.d = (l.d + dt * 7) % P.ambLoop.L;
    l.t.place(P.ambLoop, l.d);
  }
}

// ---------- 渲染循环 ----------
let last = performance.now(), T = 0, W = 0, H = 0;
const perf = { n: 0, sum: 0, checked: false };
function resize() {
  W = innerWidth;
  H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  T += dt;
  if (mode !== "prac" && playing) main.tick(dt * speed);
  if (ambientOn) ambientTick(dt, T);
  const bob = Math.sin(T * 3) * 0.4;
  for (const m of markers) m.position.y = CH / 2 + 2.6 + bob;
  if (ghost.visible) ghost.children[0].material.opacity = 0.18 + 0.14 * Math.sin(T * 4);
  // 镜头
  if (autoCam) {
    const g = goalNow();
    if (g) {
      const k = 1 - Math.exp(-dt * 2.4);
      camera.position.lerp(g[0], k);
      controls.target.lerp(g[1], k);
    }
  }
  controls.update();
  sky.position.copy(camera.position);
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).add(SUN_OFF);
  renderer.render(scene, camera);
  for (const l of labels) {
    if (!l.show()) l.el.style.display = "none";
    else placeOverlay(l.el, l.get(), W, H);
  }
  if (badgeAnchor && badgesEl.childElementCount) placeOverlay(badgesEl, badgeAnchor(), W, H, "translate(28px, -50%)");
  else badgesEl.style.display = "none";
  // 性能自检：前几秒太卡就关闭环境动效与软阴影
  if (!perf.checked && T > 1.5) {
    perf.n++;
    perf.sum += dt;
    if (perf.n >= 90) {
      perf.checked = true;
      if (perf.sum / perf.n > 1 / 24) {
        setAmbient(false);
        renderer.setPixelRatio(1);
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        resize();
        toast("设备较慢，已自动关闭环境动效，保证流畅");
      }
    }
  }
  requestAnimationFrame(frame);
}
function setAmbient(on) {
  ambientOn = on;
  $("ambBtn").classList.toggle("on", on);
}

// ---------- 点击设备查看说明 ----------
const ray = new THREE.Raycaster();
let downAt = null;
canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hits = ray.intersectObjects(pickables, true).filter((h) => h.object.isMesh && h.object.visible);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.info) o = o.parent;
    if (o) return showInfo(o.userData.info, e.clientX, e.clientY);
  }
  $("info").classList.remove("show");
});
function showInfo(key, x, y) {
  const el = $("info");
  $("infoT").textContent = INFO[key][0];
  $("infoP").textContent = INFO[key][1];
  el.classList.add("show");
  const w = 270, h = el.offsetHeight;
  el.style.left = Math.min(innerWidth - w - 8, Math.max(8, (x ?? innerWidth / 2) + 12)) + "px";
  el.style.top = Math.min(innerHeight - h - 8, Math.max(56, (y ?? 120) - 20)) + "px";
}
$("infoX").onclick = () => $("info").classList.remove("show");

// ---------- 提示 / 弹窗 ----------
let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function showModal(html) {
  $("dlg").innerHTML = html;
  $("modal").classList.add("show");
}
function hideModal() { $("modal").classList.remove("show"); }
$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") return hideModal();
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  hideModal();
  if (act === "replay") goStep(0);
  else if (act === "imp" || act === "exp" || act === "rail" || act === "prac") setMode(act);
});

// ---------- 知识点 ----------
function helpHtml() {
  return `
  <h2>知识点：集装箱码头换装链</h2>
  <p>一个集装箱在码头要依次经过<b>岸桥、集卡、场桥、堆场、闸口</b>，任何一环慢下来，整条链都会跟着等。</p>
  <div class="kgrid">
    <div class="kcard"><b>岸桥（STS）</b><p>码头前沿，负责装船、卸船。每小时 25–35 箱，决定整条链的节奏。</p></div>
    <div class="kcard"><b>内集卡</b><p>港区内部，在岸桥和场桥之间“水平运输”。</p></div>
    <div class="kcard"><b>场桥（RTG / RMG）</b><p>堆场里收箱、发箱、翻箱，跨 6 排箱 + 1 条车道，堆 4–5 层。</p></div>
    <div class="kcard"><b>门吊 / 正面吊</b><p>铁路装卸线上把箱子在集卡和铁路平车之间吊装。门吊效率高，正面吊机动灵活。</p></div>
    <div class="kcard"><b>铁路平车 / 班列</b><p>平车四角有锁头固定箱子，装好加固后按时刻表整列发运。</p></div>
    <div class="kcard"><b>闸口</b><p>港区大门：车牌箱号识别、预约与单证核对、箱体铅封检查、过磅，然后放行。</p></div>
  </div>
  <h4>海铁换装（船 → 铁路）</h4>
  <p>卸船 → 水平运输 → 堆场落地堆存 → 按装车计划发箱 → 集卡短驳到铁路装卸线 → 门吊（或正面吊）装上平车 → 加固检查 → 班列发运。箱子不进堆场、直接从船边送去装车叫<b>直取</b>，省一次落地和吊装，但衔接要求更高。</p>
  <h4>进口与出口对比</h4>
  <table class="cmp">
    <tr><th></th><th>进口</th><th>出口</th></tr>
    <tr><td>起点 → 终点</td><td>船 → 收货人</td><td>发货人 → 船</td></tr>
    <tr><td>岸桥</td><td>卸船</td><td>装船</td></tr>
    <tr><td>外集卡过闸</td><td>空车进、重车出</td><td>重车进、空车出</td></tr>
    <tr><td>关键手续</td><td>海关放行、提货单、提箱预约</td><td>订舱、集港预约、VGM、配载图</td></tr>
  </table>
  <h4>关键术语</h4>
  <ul>
    <li><b>TEU</b>：标准箱，1 个 20 尺箱 = 1 TEU，1 个 40 尺箱 = 2 TEU。</li>
    <li><b>贝—排（列）—层</b>：船上和堆场里的箱位编号。船上甲板层从 82 开始往上编。</li>
    <li><b>VGM</b>：核实总重，出口箱装船前必须申报。</li>
    <li><b>EIR</b>：设备交接单，记录箱子交接时的状况。</li>
    <li><b>翻箱</b>：要取的箱子被压在下面，只能先挪走上面的箱子。</li>
    <li><b>集港 / 截港</b>：出口箱集中进港的时间段 / 最后收箱时间。</li>
  </ul>
  <h4>配几辆集卡？</h4>
  <div class="formula">集卡作业周期 = 岸下交接 + 往返行驶 + 堆场作业<br>配车数 = 集卡作业周期 ÷ 岸桥作业周期，<b>结果向上取整</b></div>
  <p>例：岸桥每 2 分钟一吊，集卡跑一圈要 8 分钟，就要 8 ÷ 2 = 4 辆车轮流接力，岸桥才不会停下来等车。</p>
  <div class="acts"><button class="btn primary" onclick="document.getElementById('modal').classList.remove('show')">知道了</button></div>`;
}

// ---------- 练习 ----------
const IMP_ORDER = IMP.map((s) => s.short);
const EXP_ORDER = EXP.map((s) => s.short);
const RAIL_ORDER = RAIL.map((s) => s.short);
const ORDERS = { imp: IMP_ORDER, exp: EXP_ORDER, rail: RAIL_ORDER };
const PARTS = [
  { key: "rail", name: "换装排序", max: 20 },
  { key: "quiz", name: "换装小题", max: 20 },
  { key: "imp", name: "进口排序", max: 20 },
  { key: "exp", name: "出口排序", max: 20 },
  { key: "disp", name: "集卡配置", max: 20 },
];
const best = { rail: null, quiz: null, imp: null, exp: null, disp: null };
let pTab = "rail";
// 换装小题（每题 10 分）
const QUIZ = [
  {
    q: "堆场里要装火车的目标箱上面还压着 2 个箱子，场桥每吊一次约 2 分钟。把目标箱取出装上集卡，场桥一共要吊几次、大约多少分钟？",
    opts: ["1 次，约 2 分钟", "3 次，约 6 分钟", "2 次，约 4 分钟", "5 次，约 10 分钟"],
    ans: 1,
    exp: "先把上面 2 个箱子挪开（翻箱 2 次），再吊目标箱 1 次，共 3 次约 6 分钟，是不压箱时的 3 倍。所以堆存时要让先装车的箱子在上层，减少翻箱。",
  },
  {
    q: "下面哪一组设备指派是正确的？",
    opts: ["岸桥：堆场里堆取箱；场桥：船舶装卸；门吊：装火车", "岸桥：船舶装卸；场桥：堆场里堆取箱；门吊或正面吊：装火车", "空箱堆高机：重箱装火车；岸桥：堆场堆取箱", "场桥：船舶装卸；正面吊：堆场里堆取箱"],
    ans: 1,
    exp: "岸桥在码头前沿装卸船，场桥负责堆场堆取箱，铁路装卸线用门吊或正面吊装卸火车；空箱堆高机只能吊空箱。",
  },
];
let quiz = { pick: QUIZ.map(() => null), done: false, score: 0 };
const shuffle = (a) => {
  const b = a.slice();
  do {
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
  } while (b.every((x, i) => x === a[i]));
  return b;
};
const sortState = {};
function newSort(key) {
  const order = ORDERS[key];
  sortState[key] = { pool: shuffle(order), slots: Array(order.length).fill(null), done: false, score: 0, ok: 0 };
}
newSort("imp");
newSort("exp");
newSort("rail");
// 集卡配置：三轮，每轮从题库里随机抽一组参数
const DISP_POOL = [
  [{ moves: 30, dist: 1.2, v: 18, yard: 2 }, { moves: 30, dist: 1.5, v: 18, yard: 3 }, { moves: 24, dist: 1.0, v: 15, yard: 3.5 }],
  [{ moves: 25, dist: 2.0, v: 20, yard: 3 }, { moves: 20, dist: 2.4, v: 18, yard: 3 }, { moves: 30, dist: 1.8, v: 20, yard: 2.5 }],
  [{ moves: 30, dist: 3.0, v: 15, yard: 2.5 }, { moves: 25, dist: 3.6, v: 18, yard: 3 }, { moves: 24, dist: 4.0, v: 20, yard: 3 }],
];
let disp;
function newDisp() {
  disp = { round: 0, n: 3, res: [], rounds: DISP_POOL.map((pool) => pool[Math.floor(Math.random() * pool.length)]), submitted: false };
}
newDisp();
const fmt = (x) => (Math.round(x * 100) / 100).toString();
function dispCalc(p) {
  const tc = 60 / p.moves, travel = (p.dist / p.v) * 60, cycle = tc + travel + p.yard;
  return { tc, travel, cycle, opt: Math.ceil(cycle / tc - 1e-9) };
}
// 模拟 60 分钟：岸桥按先到先服务，一次作业 tc 分钟；集卡离开后 travel + yard 分钟再回来
function simulate(p, n) {
  const { tc, travel } = dispCalc(p);
  const away = travel + p.yard;
  const trucks = Array.from({ length: n }, (_, i) => ({ arrive: i * tc, segs: [] }));
  const crane = [];
  let t = 0, moves = 0, idle = 0, queue = 0;
  for (let guard = 0; guard < 500 && t < 60; guard++) {
    let nx = trucks[0];
    for (const tr of trucks) if (tr.arrive < nx.arrive) nx = tr;
    const start = Math.max(t, nx.arrive);
    if (start > t) {
      crane.push([t, Math.min(start, 60), "idle"]);
      idle += Math.min(start, 60) - t;
    }
    if (start >= 60) break;
    if (start > nx.arrive) {
      nx.segs.push([nx.arrive, Math.min(start, 60), "queue"]);
      queue += Math.min(start, 60) - nx.arrive;
    }
    const end = start + tc;
    crane.push([start, Math.min(end, 60), "busy"]);
    nx.segs.push([start, Math.min(end, 60), "busy"]);
    if (end <= 60) moves++;
    nx.segs.push([Math.min(end, 60), Math.min(end + away, 60), "away"]);
    nx.arrive = end + away;
    t = end;
  }
  for (const tr of trucks) if (tr.segs.length === 0 || tr.segs[0][0] > 0) tr.segs.unshift([0, Math.min(tr.segs[0]?.[0] ?? 60, 60), "away"]);
  return { crane, trucks, moves, idle, queue };
}
function drawGantt(sim, n, prog = 1) {
  const cv = $("gantt");
  if (!cv) return;
  const rows = n + 1, rh = 16, top = 18, left = 44, dpr = Math.min(devicePixelRatio, 2);
  const w = cv.clientWidth, h = top + rows * rh + 20;
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.height = h + "px";
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const X = (m) => left + (m / 60) * (w - left - 8);
  const lim = 60 * prog;
  const col = { busy: "#2f6fed", idle: "#ef4444", queue: "#f59e0b", away: "#cbd5e1" };
  g.font = `11px ${FONT}`;
  g.fillStyle = "#64748b";
  g.textAlign = "center";
  for (let m = 0; m <= 60; m += 10) {
    g.fillText(m + "", X(m), 11);
    g.fillStyle = "rgba(100,116,139,.15)";
    g.fillRect(X(m), 14, 1, rows * rh + 4);
    g.fillStyle = "#64748b";
  }
  g.textAlign = "right";
  const bars = (segs, y) => {
    for (const [a, b, s] of segs) {
      if (a >= lim) continue;
      g.fillStyle = col[s];
      g.fillRect(X(a), y + 2, Math.max(1, X(Math.min(b, lim)) - X(a) - 0.5), rh - 5);
    }
  };
  g.fillStyle = "#0f172a";
  g.fillText("岸桥", left - 6, top + rh / 2 + 3);
  bars(sim.crane, top);
  sim.trucks.forEach((tr, i) => {
    g.fillStyle = "#475569";
    g.fillText("集卡" + (i + 1), left - 6, top + (i + 1) * rh + rh / 2 + 3);
    bars(tr.segs, top + (i + 1) * rh);
  });
  g.textAlign = "left";
  g.fillStyle = "#94a3b8";
  g.fillText("时间（分钟）", left, h - 5);
}
function totalScore() {
  return PARTS.reduce((s, p) => s + (best[p.key] ?? 0), 0);
}
function post(msg) {
  try { parent.postMessage(msg, "*"); } catch { /* 单独打开时没有父页面 */ }
}
function report() {
  const score = totalScore();
  $("scoreTop").textContent = score + "分";
  post({ type: "tp:score", score, max: 100, detail: { railOrder: best.rail, railQuiz: best.quiz, importOrder: best.imp, exportOrder: best.exp, dispatch: best.disp } });
  if (PARTS.every((p) => best[p.key] !== null)) post({ type: "tp:complete" });
}
function renderPractice() {
  const el = $("prac");
  const tabs = PARTS.map((p) => `<button data-tab="${p.key}" class="${pTab === p.key ? "on" : ""}">${p.name}<b>${best[p.key] === null ? "未做" : best[p.key] + "/" + p.max}</b></button>`).join("");
  let body = "";
  if (ORDERS[pTab]) {
    const st = sortState[pTab], order = ORDERS[pTab], max = PARTS.find((x) => x.key === pTab).max;
    const desc = { imp: "进口箱从卸船到离港", exp: "出口箱从进港到装船离港", rail: "海铁联运箱从卸船到班列发运" }[pTab];
    body = `<div class="ph">${FLOW_NAME[pTab]}作业排序</div>
      <div class="pdesc">把下面的作业环节按${desc}的先后顺序排好。点一个环节放进下一个空位，点已放好的格子可以取回。</div>
      <div class="slots">${st.slots.map((s, i) => {
        const cls = st.done ? (s === order[i] ? "ok" : "bad") : s ? "fill" : "";
        return `<div class="slot ${cls}" data-slot="${i}"><i>${i + 1}</i><span>${s ?? ""}</span>${st.done && s !== order[i] ? `<span class="ans">应为：${order[i]}</span>` : ""}</div>`;
      }).join("")}</div>
      ${st.done ? "" : `<div class="pool">${st.pool.map((p, i) => `<button data-pool="${i}">${p}</button>`).join("")}</div>`}
      ${st.done ? `<div class="res ${st.score === max ? "good" : st.score >= max * 0.6 ? "mid" : "badr"}">排对 ${st.ok} / ${order.length} 个，得 ${st.score} 分。${st.score === max ? "完全正确！" : "对照上面的正确顺序，也可以回去看一遍动画。"}</div>` : ""}
      <div class="pacts">${st.done ? `<button class="btn" data-pact="resort">再练一次</button><button class="btn" data-pact="watch">看${FLOW_NAME[pTab]}动画</button>` : `<button class="btn" data-pact="clear">清空</button><button class="btn primary" data-pact="submit" ${st.slots.includes(null) ? "disabled" : ""}>提交</button>`}</div>`;
  } else if (pTab === "quiz") {
    body = `<div class="ph">换装小题</div><div class="pdesc">每题 10 分，选好后提交。</div>
      ${QUIZ.map((q, i) => `<div style="margin-bottom:12px"><div style="line-height:1.65;margin-bottom:6px"><b>${i + 1}.</b> ${q.q}</div>
        <div class="slots">${q.opts.map((o, j) => {
          const cls = quiz.done ? (j === q.ans ? "ok" : j === quiz.pick[i] ? "bad" : "") : j === quiz.pick[i] ? "fill" : "";
          return `<div class="slot ${cls}" data-q="${i}" data-o="${j}"><i>${"ABCD"[j]}</i><span>${o}</span></div>`;
        }).join("")}</div>
        ${quiz.done ? `<div class="res ${quiz.pick[i] === q.ans ? "good" : "badr"}">${quiz.pick[i] === q.ans ? "✓ 正确。" : "✗ 正确答案是 " + "ABCD"[q.ans] + "。"}${q.exp}</div>` : ""}</div>`).join("")}
      <div class="pacts">${quiz.done ? `<button class="btn" data-pact="requiz">再做一次</button>` : `<button class="btn primary" data-pact="qsubmit" ${quiz.pick.includes(null) ? "disabled" : ""}>提交</button>`}</div>`;
  } else {
    const p = disp.rounds[disp.round], c = dispCalc(p), r = disp.res[disp.round];
    body = `<div class="ph">岸桥要配几辆集卡？</div>
      <div class="rounds">${disp.rounds.map((_, i) => `<span class="${i === disp.round ? "on" : disp.res[i] ? (disp.res[i].s === 1 ? "ok" : disp.res[i].s > 0 ? "mid" : "bad") : ""}">第 ${i + 1} 题</span>`).join("")}</div>
      <div class="pdesc">一台岸桥卸船，集卡在岸桥和堆场之间轮流接力。派少了岸桥要停下来等车，派多了集卡在岸桥下排队浪费。请算出<b>刚好让岸桥不等车的最少集卡数</b>。</div>
      <table class="params">
        <tr><td>岸桥效率</td><td>每小时 ${p.moves} 箱（每 ${fmt(c.tc)} 分钟一吊）</td></tr>
        <tr><td>集卡在岸桥下交接</td><td>${fmt(c.tc)} 分钟（一个岸桥作业周期）</td></tr>
        <tr><td>码头前沿到堆场往返</td><td>${p.dist} 公里，平均车速 ${p.v} 公里/小时</td></tr>
        <tr><td>在堆场等候与场桥作业</td><td>${p.yard} 分钟</td></tr>
      </table>
      <div>派几辆集卡给这台岸桥？</div>
      <div class="stepper"><button data-pact="minus" ${r ? "disabled" : ""}>−</button><b>${r ? r.n : disp.n}</b><button data-pact="plus" ${r ? "disabled" : ""}>+</button><span style="color:#64748b">辆</span></div>
      ${r ? `<div class="res ${r.s === 1 ? "good" : r.s > 0 ? "mid" : "badr"}">${r.msg}<br>集卡作业周期 = ${fmt(c.tc)} + ${fmt(c.travel)} + ${p.yard} = ${fmt(c.cycle)} 分钟；配车数 = ${fmt(c.cycle)} ÷ ${fmt(c.tc)} = ${fmt(c.cycle / c.tc)}，向上取整 = <b>${c.opt} 辆</b>。</div>
        <canvas id="gantt"></canvas>
        <div class="legend"><span style="--c:#2f6fed">岸桥作业 / 在岸下交接</span><span style="--c:#ef4444">岸桥等车</span><span style="--c:#f59e0b">集卡排队</span><span style="--c:#cbd5e1">行驶与堆场作业</span></div>
        <div class="pdesc" style="margin-top:6px">1 小时内：岸桥完成 ${r.sim.moves} 吊，等车 ${fmt(r.sim.idle)} 分钟；集卡排队共 ${fmt(r.sim.queue)} 分钟。</div>` : ""}
      <div class="pacts">${r ? (disp.round < 2 ? `<button class="btn primary" data-pact="nextr">下一题</button>` : `<button class="btn" data-pact="redisp">换一组题再练</button>`) : `<button class="btn primary" data-pact="dsubmit">提交并模拟</button>`}</div>`;
  }
  el.innerHTML = `<div class="total"><b>${totalScore()}</b><span>/ 100 分 · 5 个部分各 20 分，每部分记最高分，可反复练习</span></div><div class="ptabs">${tabs}</div>${body}`;
  const r = pTab === "disp" && disp.res[disp.round];
  if (r) {
    const t0 = performance.now();
    const anim = () => {
      const k = Math.min(1, (performance.now() - t0) / 1600);
      drawGantt(r.sim, r.n, k);
      if (k < 1 && $("gantt")) requestAnimationFrame(anim);
    };
    anim();
  }
}
$("prac").addEventListener("click", (e) => {
  const t = e.target.closest("button,[data-slot],[data-q]");
  if (!t) return;
  if (t.dataset.tab) {
    pTab = t.dataset.tab;
    return renderPractice();
  }
  if (t.dataset.q !== undefined) {
    if (!quiz.done) quiz.pick[+t.dataset.q] = +t.dataset.o;
    return renderPractice();
  }
  const st = sortState[pTab];
  if (t.dataset.pool !== undefined) {
    const i = st.slots.indexOf(null);
    st.slots[i] = st.pool.splice(+t.dataset.pool, 1)[0];
    return renderPractice();
  }
  if (t.dataset.slot !== undefined && st && !st.done) {
    const i = +t.dataset.slot;
    if (st.slots[i]) {
      st.pool.push(st.slots[i]);
      st.slots[i] = null;
    }
    return renderPractice();
  }
  const a = t.dataset.pact;
  if (a === "clear") {
    st.pool.push(...st.slots.filter(Boolean));
    st.slots.fill(null);
  } else if (a === "submit") {
    const order = ORDERS[pTab];
    const ok = st.slots.filter((s, i) => s === order[i]).length;
    st.ok = ok;
    st.score = Math.round((20 * ok) / order.length);
    st.done = true;
    best[pTab] = Math.max(best[pTab] ?? 0, st.score);
    report();
  } else if (a === "qsubmit") {
    quiz.score = QUIZ.reduce((x, q, i) => x + (quiz.pick[i] === q.ans ? 10 : 0), 0);
    quiz.done = true;
    best.quiz = Math.max(best.quiz ?? 0, quiz.score);
    report();
  } else if (a === "requiz") quiz = { pick: QUIZ.map(() => null), done: false, score: 0 };
  else if (a === "resort") newSort(pTab);
  else if (a === "watch") return setMode(pTab);
  else if (a === "minus") disp.n = Math.max(1, disp.n - 1);
  else if (a === "plus") disp.n = Math.min(12, disp.n + 1);
  else if (a === "dsubmit") {
    const p = disp.rounds[disp.round], c = dispCalc(p), n = disp.n;
    const sim = simulate(p, n);
    let s, msg;
    if (n === c.opt) {
      s = 1;
      msg = `✓ 正确！${n} 辆集卡刚好接上岸桥的节奏。`;
    } else if (n > c.opt) {
      s = 0.5;
      msg = `岸桥不会等车，但多派了 ${n - c.opt} 辆，多出来的集卡在岸桥下排队，浪费运力。得一半分。`;
    } else {
      s = 0;
      msg = `集卡不够：岸桥每小时要停下来等车约 ${fmt(sim.idle)} 分钟，效率下降。`;
    }
    disp.res[disp.round] = { n, s, msg, sim };
    if (disp.round === 2) {
      const sc = Math.round((20 * disp.res.reduce((x, r) => x + r.s, 0)) / 3);
      best.disp = Math.max(best.disp ?? 0, sc);
      report();
    }
  } else if (a === "nextr") {
    disp.round++;
    disp.n = 3;
  } else if (a === "redisp") newDisp();
  renderPractice();
});

// ---------- 界面事件 ----------
document.querySelectorAll("#modeSeg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("steps").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) goStep(+li.dataset.i);
});
$("equip").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) showInfo(b.dataset.k, innerWidth / 2 - 135, 120);
});
$("prevBtn").onclick = () => goStep(stepIdx - 1);
$("nextBtn").onclick = () => goStep(stepIdx + 1);
$("replayBtn").onclick = () => goStep(stepIdx);
$("playBtn").onclick = () => setPlaying(!playing);
const SPEEDS = [1, 2, 0.5];
$("speedBtn").onclick = () => {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  $("speedBtn").textContent = speed + " 倍速";
};
$("autoBtn").onclick = () => {
  autoNext = !autoNext;
  $("autoBtn").classList.toggle("on", autoNext);
};
$("camBtn").onclick = () => setAutoCam(!autoCam);
$("viewAll").onclick = () => {
  camGoal = OVERVIEW;
  setAutoCam(true);
};
$("lblBtn").onclick = () => {
  const off = document.body.classList.toggle("nolabels");
  $("lblBtn").classList.toggle("on", !off);
};
$("ambBtn").onclick = () => setAmbient(!ambientOn);
$("helpBtn").onclick = () => showModal(helpHtml());
$("flowToggle").onclick = () => $("flowPanel").classList.toggle("open");
addEventListener("keydown", (e) => {
  if (mode === "prac" || e.target.tagName === "INPUT") return;
  if (e.key === " ") {
    e.preventDefault();
    setPlaying(!playing);
  } else if (e.key === "ArrowRight") goStep(stepIdx + 1);
  else if (e.key === "ArrowLeft") goStep(stepIdx - 1);
});

// ---------- 启动 ----------
camera.position.set(...OVERVIEW.pos);
controls.target.set(...OVERVIEW.tgt);
setMode("rail");
setPlaying(false);
showModal(`
  <h2>集装箱码头换装链</h2>
  <p>跟着一个集装箱走完码头的换装作业：<b>船 → 岸桥 → 堆场 → 集卡短驳 → 门吊 → 铁路平车 → 班列发运</b>，也可以看普通进口、出口流程。</p>
  <h4>怎么用</h4>
  <ul>
    <li><b>海铁换装 / 进口流程 / 出口流程</b>：每条流程 8 步动画，每步有讲解。可以暂停、上一步、下一步、倍速。</li>
    <li>拖动画面旋转视角，滚轮或双指缩放；点任何设备可以看它的名称和作用。</li>
    <li><b>练习</b>：换装排序、换装小题、进口排序、出口排序、集卡配置，各 20 分，满分 100 分。可以反复练，每部分记最高分，成绩计入平台。</li>
  </ul>
  <div class="acts">
    <button class="btn" data-act="prac">直接练习</button>
    <button class="btn" data-act="imp">看进口流程</button>
    <button class="btn primary" data-act="rail">看海铁换装</button>
  </div>`);
// 弹窗里选“出口流程 / 直接练习”时也开始播放
$("modal").addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]")?.dataset.act;
  if (a === "exp" || a === "imp" || a === "rail" || a === "replay") setPlaying(true);
});
window.__pc = { goStep, setMode, fast: (k) => (speed = k), info: () => renderer.info.render };
requestAnimationFrame(frame);
