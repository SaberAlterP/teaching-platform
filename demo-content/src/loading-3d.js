// 装车配载 3D 模拟：自由练习 + 三关任务（轻重配装、家电与易碎品、重心控制）
// 构建：npm run demo:build  → demo-content/dist/装车配载-3D.html（单文件，可直接上传到平台）
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { Builder, INK, M, cargoModel, corrugated, lineMat, lineMats, makeTex, std } from "./loading-3d-art.js";

// ---------- 数据 ----------
const G = 0.05; // 摆放网格 5 cm，所有尺寸都是它的整数倍
const cells = (m) => Math.round(m / G);

// 内尺寸（米）与额定载重（kg），取常见值，实际以车辆行驶证 / 箱门铭牌为准
const CONTAINERS = {
  gp20: { name: "20 尺普通箱（20GP）", short: "20GP", L: 5.9, W: 2.35, H: 2.39, payload: 21700, kind: "box" },
  gp40: { name: "40 尺普通箱（40GP）", short: "40GP", L: 12.03, W: 2.35, H: 2.39, payload: 26500, kind: "box" },
  van: { name: "9.6 米厢式货车", short: "9.6 米货车", L: 9.6, W: 2.3, H: 2.5, payload: 18000, kind: "truck" },
};

// dims：长 × 宽 × 高（米）；up：不可倒置；fragile：易碎；pallet：带托盘
const CARGO = {
  steel: { name: "钢制零件", dims: [1.2, 1.0, 0.6], kg: 1800, color: 0x64748b, pallet: true },
  tile: { name: "瓷砖", dims: [1.2, 1.0, 0.8], kg: 1500, color: 0xc2703d, pallet: true },
  oil: { name: "桶装机油", dims: [1.2, 1.0, 1.0], kg: 900, color: 0x2563eb, pallet: true, up: true },
  drink: { name: "瓶装饮料", dims: [1.2, 1.0, 1.2], kg: 1000, color: 0x0ea5b7, pallet: true },
  foam: { name: "泡沫制品", dims: [1.2, 1.0, 1.2], kg: 120, color: 0xf3f1ea, pallet: true },
  quilt: { name: "棉被", dims: [1.0, 0.8, 0.8], kg: 60, color: 0xf4a7c8 },
  fridge: { name: "冰箱", dims: [0.7, 0.7, 1.8], kg: 90, color: 0xdfe6ee, up: true },
  washer: { name: "洗衣机", dims: [0.65, 0.65, 0.9], kg: 70, color: 0xc7d9ea, up: true },
  glass: { name: "玻璃器皿", dims: [0.6, 0.5, 0.5], kg: 40, color: 0xa7f3d0, up: true, fragile: true },
  daily: { name: "日用百货", dims: [0.6, 0.4, 0.4], kg: 15, color: 0xd6b88a },
  furn: { name: "板式家具", dims: [2.0, 0.6, 0.3], kg: 65, color: 0xa47148 },
};
for (const t of Object.values(CARGO)) t.vol = t.dims[0] * t.dims[1] * t.dims[2];

const TASKS = [
  {
    short: "任务一",
    title: "任务一 · 轻重配装",
    container: "gp20",
    items: { steel: 5, tile: 4, foam: 8, daily: 12 },
    goal: "把这批货全部装进 20 尺箱。钢制零件、瓷砖是<b>重货</b>，泡沫制品、日用百货是<b>轻泡货</b>。",
    tip: "重货铺在底层，轻泡货压在重货上面，这样载重和空间都能用上。",
  },
  {
    short: "任务二",
    title: "任务二 · 家电与易碎品",
    container: "van",
    items: { tile: 4, fridge: 10, washer: 10, glass: 8, quilt: 6, daily: 16 },
    goal: "给一辆 9.6 米厢式货车配载家电、玻璃器皿和百货。注意<b>不可倒置</b>和<b>易碎</b>标志。",
    tip: "瓷砖放底层，冰箱、洗衣机要立着放；玻璃器皿放在最上层，上面不要再压东西。",
  },
  {
    short: "任务三",
    title: "任务三 · 重心控制",
    container: "gp40",
    items: { steel: 8, drink: 8, oil: 2, foam: 10 },
    goal: "40 尺箱，这批货的重量接近限重。全部装进去，并让<b>重心落在绿框内</b>。",
    tip: "重货沿箱子长度方向均匀铺开，不要都堆在里端或门口；两侧也要左右对称。",
  },
];

const LIM = 0.1; // 重心允许偏离：长、宽的 10%

// ---------- 状态 ----------
let mode = "free";
let levelIdx = 0;
const free = { container: "gp20", boxes: [] };
const levels = TASKS.map(() => ({ boxes: [], best: null }));
let nextId = 1;
let selType = null; // 正在放的货物类型
let orient = { yaw: 0, tip: 0 };
let ghostPos = null; // {x,z,y,valid,reason}
let picked = null; // 已选中的已装货物
let hm = null, nx = 0, nz = 0, Hc = 0;

const state = () => (mode === "free" ? free : levels[levelIdx]);
const contKey = () => (mode === "free" ? free.container : TASKS[levelIdx].container);
const cont = () => CONTAINERS[contKey()];

// ---------- 三维基础 ----------
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8eef6);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 300);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI * 0.495;

scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b3c2, 0.75));
const sun = new THREE.DirectionalLight(0xfff8ef, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const root = new THREE.Group(); // 原点在车厢内部地板的里端角（x 向门口，z 向另一侧）
scene.add(root);
let envGroup = null;
const boxGroup = new THREE.Group();
root.add(boxGroup);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

// ---------- 货物贴图 ----------
const texCache = {};
function isDark(hex) {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 0.55;
}
function faceTex(key, wm, hm_, top) {
  const t = CARGO[key];
  const ppm = 200;
  let w = wm * ppm, h = hm_ * ppm;
  const s = Math.min(1, 512 / Math.max(w, h));
  w = Math.max(48, Math.round(w * s));
  h = Math.max(48, Math.round(h * s));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  const col = "#" + new THREE.Color(t.color).getHexString();
  g.fillStyle = col;
  g.fillRect(0, 0, w, h);
  const bodyH = h;
  // 细腻但简洁的表面层次：轻微的上亮下暗 + 内框线
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(255,255,255,.10)");
  grad.addColorStop(1, "rgba(0,0,0,.08)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(0,0,0,.14)";
  g.lineWidth = Math.max(1.5, Math.min(w, h) * 0.012);
  const inset = Math.min(w, h) * 0.05;
  g.strokeRect(inset, inset, w - 2 * inset, bodyH - 2 * inset);
  if (!t.pallet && !top) {
    g.fillStyle = "rgba(0,0,0,.08)"; // 纸箱封口胶带
    g.fillRect(0, bodyH * 0.06, w, bodyH * 0.07);
  }
  const fg = isDark(t.color) ? "#ffffff" : "#1e293b";
  const font = (px, b) => `${b ? "700 " : ""}${px}px "PingFang SC","Microsoft YaHei",sans-serif`;
  const fit = (txt, px, maxW, bold) => {
    g.font = font(px, bold);
    const m = g.measureText(txt).width;
    if (m > maxW) px = Math.max(8, Math.floor((px * maxW) / m));
    g.font = font(px, bold);
    return px;
  };
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = fg;
  const base = Math.min(bodyH * 0.2, w * 0.2);
  let y = bodyH * (t.up || t.fragile ? 0.32 : 0.4);
  fit(t.name, base, w * 0.86, true);
  g.fillText(t.name, w / 2, y);
  fit(t.kg + " kg", base * 0.8, w * 0.8);
  g.fillText(t.kg + " kg", w / 2, y + base * 1.05);
  if (!top && (t.up || t.fragile)) {
    // 包装储运标志
    const iy = bodyH * 0.76, sz = Math.min(bodyH * 0.2, w * 0.2);
    const marks = [];
    if (t.up) marks.push("up");
    if (t.fragile) marks.push("frag");
    marks.forEach((m, i) => {
      const cx = w / 2 + (i - (marks.length - 1) / 2) * sz * 1.5;
      g.strokeStyle = g.fillStyle = m === "up" ? "#15803d" : "#dc2626";
      g.lineWidth = Math.max(2, sz * 0.1);
      if (m === "up") {
        for (const dx of [-0.22, 0.22]) {
          const x = cx + dx * sz;
          g.beginPath();
          g.moveTo(x, iy + sz * 0.45);
          g.lineTo(x, iy - sz * 0.25);
          g.stroke();
          g.beginPath();
          g.moveTo(x - sz * 0.17, iy - sz * 0.15);
          g.lineTo(x, iy - sz * 0.45);
          g.lineTo(x + sz * 0.17, iy - sz * 0.15);
          g.fill();
        }
      } else {
        // 高脚杯
        g.beginPath();
        g.moveTo(cx - sz * 0.28, iy - sz * 0.45);
        g.lineTo(cx + sz * 0.28, iy - sz * 0.45);
        g.lineTo(cx + sz * 0.05, iy);
        g.lineTo(cx - sz * 0.05, iy);
        g.closePath();
        g.fill();
        g.fillRect(cx - sz * 0.04, iy, sz * 0.08, sz * 0.32);
        g.fillRect(cx - sz * 0.22, iy + sz * 0.32, sz * 0.44, sz * 0.09);
      }
    });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function cargoMats(key) {
  if (texCache[key]) return texCache[key];
  const [l, w, h] = CARGO[key].dims;
  const end = mat(0xffffff, { map: faceTex(key, w, h) });
  const side = mat(0xffffff, { map: faceTex(key, l, h) });
  const top = mat(0xffffff, { map: faceTex(key, l, w, true) });
  // BoxGeometry 面顺序：+x, -x, +y, -y, +z, -z
  return (texCache[key] = [end, end, top, top, side, side]);
}
const geoCache = {};
function cargoGeo(key) {
  const [l, w, h] = CARGO[key].dims;
  return (geoCache[key] ||= new THREE.BoxGeometry(l, h, w));
}
const edgeCache = {};
function cargoEdges(key) {
  return (edgeCache[key] ||= new THREE.EdgesGeometry(cargoGeo(key)));
}
// 精细模型（每种货物建一次，之后克隆共用几何体和材质）
const modelCache = {};
function cargoTemplate(key) {
  const labelMats = (l, h, w) => {
    const m = (tex) => std(0xffffff, { map: tex, roughness: 0.78 });
    const end = m(faceTex(key, w, h)), side = m(faceTex(key, l, h)), top = m(faceTex(key, l, w, true));
    return [end, end, top, top, side, side];
  };
  return (modelCache[key] ||= cargoModel(key, CARGO[key], labelMats, (wm, hm_) => faceTex(key, wm, hm_)));
}

// 朝向：tip 0 正放，1 沿长度方向放倒，2 沿宽度方向放倒；yaw 水平转 90°
function orientQuat(o) {
  const q = new THREE.Quaternion();
  if (o.tip === 1) q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  if (o.tip === 2) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  if (o.yaw) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  return q;
}
// 旋转后在 x/z/y 三个方向上占的格数
function orientDims(key, o) {
  const [l, w, h] = CARGO[key].dims;
  const m = new THREE.Matrix4().makeRotationFromQuaternion(orientQuat(o)).elements;
  const src = [l, h, w]; // 几何体本身的 x/y/z 尺寸
  const ext = (row) => Math.abs(m[row]) * src[0] + Math.abs(m[row + 4]) * src[1] + Math.abs(m[row + 8]) * src[2];
  return { dl: cells(ext(0)), dh: cells(ext(1)), dw: cells(ext(2)) };
}

// ---------- 车厢 / 集装箱模型 ----------
const fadeWalls = []; // 朝向镜头的箱壁自动变透明，方便看清里面
let envLineMats = [];
const _fv = new THREE.Vector3();
function fadeUpdate() {
  for (const f of fadeWalls) {
    root.localToWorld(_fv.copy(f.center));
    _fv.subVectors(camera.position, _fv);
    const target = _fv.dot(f.normal) > 0 ? 0.1 : 1;
    f.op += (target - f.op) * 0.15;
    f.m.opacity = f.op;
    f.m.depthWrite = f.op > 0.95;
    f.lm.opacity = f.lmBase * f.op;
  }
}

const groundTex = makeTex(256, 256, (g, w, h) => {
  g.fillStyle = "#d6dee8";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "90,100,115"},${Math.random() * 0.06})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.strokeStyle = "rgba(90,100,115,.14)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, w, h);
});
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(50, 50);

function codeTex(lines, color) {
  return makeTex(512, 256, (g, w, h) => {
    g.fillStyle = color;
    g.textBaseline = "top";
    lines.forEach(([txt, px, bold], i) => {
      g.font = `${bold ? "700 " : ""}${px}px "Arial","Microsoft YaHei",sans-serif`;
      g.fillText(txt, 16, 16 + lines.slice(0, i).reduce((s, l) => s + l[1] * 1.25, 0));
    });
  });
}

function buildEnv() {
  if (envGroup) {
    root.remove(envGroup);
    const shared = new Set(Object.values(M));
    envGroup.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { if (shared.has(m)) return; m.map?.dispose(); if (m !== groundMat) m.dispose(); });
    });
    for (const m of envLineMats) lineMats.delete(m);
  }
  envLineMats = [];
  fadeWalls.length = 0;
  const c = cont();
  const { L, W, H } = c;
  const g = new THREE.Group();
  envGroup = g;
  root.add(g);
  const truck = c.kind === "truck";
  const floorY = truck ? 1.25 : 0.16; // 车厢地板离地高度
  const gy = -floorY;
  root.position.set(-L / 2, floorY, -W / 2);

  const add = (geo, m, x, y, z, shadow = true) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const lines = (edgesGeo, lm) => {
    const o = new LineSegments2(new LineSegmentsGeometry().setPositions(edgesGeo.attributes.position.array), lm);
    g.add(o);
    return o;
  };
  const envLine = (color, width, op) => {
    const m = lineMat(color, width, op);
    envLineMats.push(m);
    return m;
  };

  // 地面：水泥地坪 + 停车位白线
  const ground = add(new THREE.PlaneGeometry(200, 200), groundMat, L / 2, gy, W / 2, false);
  ground.rotation.x = -Math.PI / 2;
  const bayMat = std(0xf8fafc, { roughness: 0.6 });
  const bx0 = truck ? -3.4 : -1.0, bx1 = L + 2.8, bz0 = -1.1, bz1 = W + 1.1;
  for (const [x, z, sx, sz] of [
    [(bx0 + bx1) / 2, bz0, bx1 - bx0, 0.1],
    [(bx0 + bx1) / 2, bz1, bx1 - bx0, 0.1],
    [bx0, (bz0 + bz1) / 2, 0.1, bz1 - bz0],
  ]) {
    const s = add(new THREE.PlaneGeometry(sx, sz), bayMat, x, gy + 0.004, z, false);
    s.rotation.x = -Math.PI / 2;
  }

  // 地板（木地板 + 0.5 m 网格线）
  const ft = makeTex(Math.min(2048, Math.round(L * 100)), Math.round((Math.min(2048, Math.round(L * 100)) * W) / L), (fg, fw, fh) => {
    const pxm = fw / L;
    fg.fillStyle = "#c99f66";
    fg.fillRect(0, 0, fw, fh);
    for (let i = 0; i * 0.2 < W; i++) {
      // 木条：每条颜色略有不同，接缝错开
      fg.fillStyle = `hsl(33, ${38 + (i % 3) * 4}%, ${56 + ((i * 7) % 5) - 2}%)`;
      fg.fillRect(0, i * 0.2 * pxm, fw, 0.2 * pxm);
      fg.fillStyle = "rgba(70,45,15,.35)";
      fg.fillRect(0, i * 0.2 * pxm, fw, 1.2);
      for (let x = ((i * 1.37) % 2.4) * pxm; x < fw; x += 2.4 * pxm) fg.fillRect(x, i * 0.2 * pxm, 1.2, 0.2 * pxm);
    }
    fg.strokeStyle = "rgba(40,28,10,.3)";
    fg.lineWidth = 1.5;
    fg.setLineDash([6, 5]);
    for (let x = 0.5; x < L; x += 0.5) { fg.beginPath(); fg.moveTo(x * pxm, 0); fg.lineTo(x * pxm, fh); fg.stroke(); }
    for (let z = 0.5; z < W; z += 0.5) { fg.beginPath(); fg.moveTo(0, z * pxm); fg.lineTo(fw, z * pxm); fg.stroke(); }
  });
  const floor = add(new THREE.PlaneGeometry(L, W), std(0xffffff, { map: ft, roughness: 0.8 }), L / 2, 0.001, W / 2, false);
  floor.rotation.x = -Math.PI / 2;
  floor.name = "floor";

  const shellColor = truck ? 0xeef2f6 : contKey() === "gp20" ? 0xc2410c : 0x1f4fbf;
  const shellOpts = truck ? { roughness: 0.4, metalness: 0.2 } : { roughness: 0.55, metalness: 0.3 };
  const frameCol = truck ? 0xb8c2cf : new THREE.Color(shellColor).multiplyScalar(0.78).getHex();
  const frameMat = std(frameCol, truck ? { roughness: 0.3, metalness: 0.7 } : shellOpts);

  // 瓦楞箱壁（三面），朝镜头的一面自动淡出
  const pitch = truck ? 0.6 : 0.28, depth = truck ? 0.018 : 0.035;
  const wall = (geo, normal, center) => {
    const m = std(shellColor, { ...shellOpts, transparent: true, side: THREE.DoubleSide });
    const mesh = add(geo, m, 0, 0, 0, false);
    const lm = envLine(0x1b2535, 0.7, 0.3);
    lines(new THREE.EdgesGeometry(geo, 30), lm);
    fadeWalls.push({ m, lm, lmBase: 0.3, normal, center, op: 1 });
    return mesh;
  };
  wall(corrugated(L, H, pitch, depth).translate(0, 0, W), new THREE.Vector3(0, 0, 1), new THREE.Vector3(L / 2, H / 2, W));
  wall(corrugated(L, H, pitch, depth).scale(1, 1, -1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(L / 2, H / 2, 0));
  wall(corrugated(W, H, pitch, depth).rotateY(-Math.PI / 2), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, H / 2, W / 2));

  // 框架：角柱、顶梁、底梁、角件
  const F = new Builder();
  const e = 0.06;
  for (const x of [-e, L + e]) for (const z of [-e, W + e]) F.add(new THREE.BoxGeometry(0.12, H + 0.26, 0.12), frameMat, x, (H - 0.06) / 2, z);
  for (const z of [-0.05, W + 0.05]) {
    F.add(new THREE.BoxGeometry(L, 0.1, 0.1), frameMat, L / 2, H + 0.05, z);
    F.add(new THREE.BoxGeometry(L, 0.16, 0.1), frameMat, L / 2, -0.08, z);
  }
  F.add(new THREE.BoxGeometry(0.1, 0.1, W), frameMat, -0.05, H + 0.05, W / 2);
  F.add(new THREE.BoxGeometry(0.12, 0.16, W), frameMat, L + e, H + 0.02, W / 2);
  F.add(new THREE.BoxGeometry(0.1, 0.16, W), frameMat, -0.05, -0.08, W / 2);
  F.add(new THREE.BoxGeometry(0.12, 0.16, W), frameMat, L + e, -0.08, W / 2);
  F.add(new THREE.BoxGeometry(L, 0.14, W), std(0x3a3f48, { roughness: 0.8 }), L / 2, -0.07, W / 2, { line: false });
  if (!truck) {
    const cast = std(0x3b3f46, { roughness: 0.5, metalness: 0.5 });
    const hole = std(0x0f1115, { roughness: 1 });
    for (const x of [-e, L + e])
      for (const z of [-e, W + e])
        for (const y of [-0.16 + 0.059, H + 0.1 - 0.059]) {
          F.add(new THREE.BoxGeometry(0.178, 0.118, 0.162), cast, x, y, z);
          F.add(new THREE.BoxGeometry(0.07, 0.035, 0.004), hole, x, y, z + Math.sign(z - W / 2) * 0.082, { line: false });
          F.add(new THREE.BoxGeometry(0.004, 0.035, 0.06), hole, x + Math.sign(x - L / 2) * 0.09, y, z, { line: false });
        }
  }
  g.add(F.build());

  // 打开的箱门（门端 x = L）：瓦楞门板、锁杆、把手、箱号
  const doorMat = std(shellColor, shellOpts);
  for (const s of [0, 1]) {
    const dir = s ? -1 : 1;
    const D = new Builder();
    const leafW = W / 2 + 0.03;
    const leaf = corrugated(leafW, H + 0.12, truck ? 0.6 : 0.3, depth).rotateY(Math.PI / 2);
    if (!s) leaf.scale(1, 1, -1);
    D.add(leaf, doorMat, 0, -0.08, 0, { line: INK.fine });
    for (const k of [0.3, 0.7]) {
      const z = dir * leafW * k;
      D.add(new THREE.CylinderGeometry(0.017, 0.017, H + 0.14, 12), M.chrome, 0.075, H / 2 - 0.02, z, { hull: 0.006, line: false });
      D.add(new THREE.BoxGeometry(0.03, 0.05, 0.2), M.steelGrey, 0.1, H * 0.42, z + dir * 0.09);
      for (const y of [-0.02, H + 0.02]) D.add(new THREE.BoxGeometry(0.06, 0.07, 0.07), M.steelGrey, 0.07, y, z);
    }
    for (const y of [0.25, H - 0.25]) D.add(new THREE.BoxGeometry(0.05, 0.18, 0.05), M.steelGrey, 0.03, y, dir * 0.03);
    if (!truck) {
      const tex = s
        ? codeTex([["TPLU 102938 4", 54, true], [contKey() === "gp20" ? "22G1" : "42G1", 44, true]], "#ffffff")
        : codeTex([["MAX GROSS 30,480 KG", 34], ["TARE          " + (contKey() === "gp20" ? "2,200" : "3,750") + " KG", 34], ["PAYLOAD  " + (c.payload / 1000).toFixed(1) + " T", 34], ["CU.CAP.  " + (L * W * H).toFixed(1) + " M³", 34]], "#ffffff");
      const plate = D.mesh(new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.36), new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 })));
      plate.position.set(0.056, H * 0.78, dir * leafW * 0.52);
      plate.rotation.y = Math.PI / 2;
    }
    const pivot = new THREE.Group();
    pivot.position.set(L + 0.12, 0, s ? W + e : -e);
    pivot.add(D.build());
    pivot.rotation.y = dir * Math.PI * 0.6;
    g.add(pivot);
  }

  // 门端标识
  const lt = makeTex(256, 64, (lg) => {
    lg.fillStyle = "#0f172a";
    lg.font = '700 34px "PingFang SC","Microsoft YaHei",sans-serif';
    lg.textAlign = "center";
    lg.textBaseline = "middle";
    lg.fillText("门端 · 装货口", 128, 32);
  });
  const lp = add(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: lt, transparent: true }), L + 1.3, gy + 0.01, W / 2, false);
  lp.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);

  if (truck) g.add(buildTruck(L, W, gy));
  buildAmbient(g, L, W, H, gy, bx0, bz0);

  // 阴影范围
  const span = Math.max(L, 8);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 5 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(L * 0.3, span * 1.6, span * 0.9);
  sun.target.position.set(0, 0, 0);

  // 重心允许范围
  cogZone.geometry.dispose();
  cogZone.geometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2 * LIM * L, 2 * LIM * W));
  cogZone.position.set(L / 2, 0.012, W / 2);
}
const groundMat = std(0xffffff, { map: groundTex, roughness: 0.95, polygonOffset: false });

// 厢式货车：驾驶室、底盘、车轮等细节（坐标以车厢地板为原点，gy 为地面高度）
function buildTruck(L, W, gy) {
  const T = new Builder();
  const cab = std(0x2f6fed, { roughness: 0.32, metalness: 0.3 });
  const trim = std(0x2b313b, { roughness: 0.55 });
  const lamp = std(0xfff4cc, { emissive: 0x6b6240, roughness: 0.2 });
  const cy0 = gy + 1.0; // 驾驶室底部离地 1 m
  const cabGeo = new RoundedBoxGeometry(1.9, 2.0, W, 3, 0.14);
  T.add(cabGeo, cab, -1.3, cy0 + 1.0, W / 2, { line: false, hull: 0.014 });
  T.add(new THREE.BoxGeometry(0.45, 0.4, W - 0.04), cab, -2.0, cy0 - 0.15, W / 2);
  T.add(new THREE.BoxGeometry(0.02, 0.78, W - 0.3), M.darkGlass, -2.255, cy0 + 1.45, W / 2, { rz: -0.08 });
  for (const z of [-0.006, W + 0.006]) {
    T.add(new THREE.BoxGeometry(0.75, 0.6, 0.02), M.darkGlass, -1.55, cy0 + 1.45, z);
    T.add(new THREE.BoxGeometry(0.004, 1.35, 0.012), trim, -0.85, cy0 + 0.95, z, { line: false });
    T.add(new THREE.BoxGeometry(0.12, 0.03, 0.03), M.chrome, -0.98, cy0 + 1.0, z + Math.sign(z) * 0.015 || -0.015, { line: INK.fine });
    T.add(new THREE.BoxGeometry(0.42, 0.05, 0.2), trim, -1.35, cy0 - 0.35, z === -0.006 ? 0.08 : W - 0.08);
    T.add(new THREE.BoxGeometry(0.28, 0.03, 0.03), trim, -2.05, cy0 + 1.3, z < 0 ? -0.13 : W + 0.13);
    T.add(new THREE.BoxGeometry(0.07, 0.34, 0.15), trim, -2.1, cy0 + 1.3, z < 0 ? -0.28 : W + 0.28);
  }
  T.add(new THREE.BoxGeometry(0.03, 0.46, W * 0.56), trim, -2.25, cy0 + 0.4, W / 2);
  for (let i = 0; i < 4; i++) T.add(new THREE.BoxGeometry(0.03, 0.03, W * 0.56), M.chrome, -2.27, cy0 + 0.22 + i * 0.12, W / 2, { line: false });
  for (const z of [0.3, W - 0.3]) T.add(new THREE.BoxGeometry(0.03, 0.13, 0.34), lamp, -2.26, cy0 + 0.05, z);
  T.add(new THREE.BoxGeometry(0.22, 0.28, W + 0.08), trim, -2.33, gy + 0.72, W / 2);
  T.add(new THREE.BoxGeometry(1.0, 0.45, W - 0.12), cab, -0.95, cy0 + 2.2, W / 2, { rz: -0.32 });
  // 底盘
  const rail = M.steelGrey;
  for (const z of [W / 2 - 0.45, W / 2 + 0.45]) T.add(new THREE.BoxGeometry(L + 2.6, 0.22, 0.1), rail, (L - 1.8) / 2, -0.35, z);
  for (let x = 0; x < L; x += 1.6) T.add(new THREE.BoxGeometry(0.08, 0.14, 0.9), rail, x, -0.35, W / 2, { line: INK.fine });
  T.add(new THREE.CylinderGeometry(0.26, 0.26, 0.95, 32), M.chrome, 1.0, -0.62, W - 0.36, { rz: Math.PI / 2, hull: 0.01 });
  T.add(new THREE.BoxGeometry(0.6, 0.42, 0.45), trim, 1.0, -0.6, 0.34);
  for (const z of [0.02, W - 0.02]) for (const y of [-0.72, -0.95]) T.add(new THREE.BoxGeometry(2.4, 0.07, 0.03), rail, L * 0.36, y, z);
  T.add(new THREE.BoxGeometry(0.12, 0.14, W - 0.1), std(0xdc2626, { roughness: 0.5 }), L + 0.12, -0.9, W / 2);
  for (const z of [W / 2 - 0.55, W / 2 + 0.55]) T.add(new THREE.BoxGeometry(0.06, 0.45, 0.06), rail, L + 0.05, -0.6, z);
  // 车轮：轮胎 + 轮辋 + 轮毂，后轴双胎
  const wheel = (x, z) => {
    T.add(new THREE.CylinderGeometry(0.5, 0.5, 0.29, 40), M.rubber, x, gy + 0.5, z, { rx: Math.PI / 2, hull: 0.01 });
    T.add(new THREE.CylinderGeometry(0.3, 0.3, 0.295, 32), M.chrome, x, gy + 0.5, z, { rx: Math.PI / 2, line: INK.fine });
    T.add(new THREE.CylinderGeometry(0.11, 0.11, 0.31, 16), M.steelGrey, x, gy + 0.5, z, { rx: Math.PI / 2, line: INK.fine });
  };
  const r1 = L * 0.6, r2 = L * 0.6 + 1.3;
  for (const z of [0.18, W - 0.18]) wheel(-1.3, z);
  for (const x of [r1, r2]) for (const z of [0.18, 0.49, W - 0.49, W - 0.18]) wheel(x, z);
  for (const z of [0.34, W - 0.34]) {
    T.add(new THREE.BoxGeometry(2.7, 0.04, 0.7), trim, (r1 + r2) / 2, gy + 1.08, z);
    T.add(new THREE.BoxGeometry(0.02, 0.45, 0.55), M.rubber, r2 + 0.7, gy + 0.4, z);
  }
  return T.build();
}

const cogGroup = new THREE.Group();
const cogZone = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x16a34a }));
cogZone.rotation.x = -Math.PI / 2;
const cogBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ color: 0xdc2626, depthTest: false }));
cogBall.renderOrder = 10;
const cogLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false }));
cogLine.renderOrder = 10;
const cogDot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.6 }));
cogDot.rotation.x = -Math.PI / 2;
cogGroup.add(cogZone, cogBall, cogLine, cogDot);
root.add(cogGroup);

// ---------- 高度图 / 摆放计算 ----------
function rebuildHM() {
  const c = cont();
  nx = Math.floor(c.L / G + 1e-6);
  nz = Math.floor(c.W / G + 1e-6);
  Hc = c.H / G;
  hm = new Float32Array(nx * nz);
  for (const b of state().boxes) stamp(b);
}
function stamp(b) {
  const top = b.y + b.dh;
  for (let i = b.x; i < b.x + b.dl; i++) for (let k = b.z; k < b.z + b.dw; k++) hm[i * nz + k] = Math.max(hm[i * nz + k], top);
}
function snapAxis(raw, size, max, edges) {
  const hi = max - size;
  let best = null, bd = 3.5; // 15 cm 以内自动贴靠墙壁或其他货物
  for (const c of [0, hi, ...edges.flatMap((e) => [e, e - size])]) {
    if (c < 0 || c > hi) continue;
    const d = Math.abs(c - raw);
    if (d < bd) { bd = d; best = c; }
  }
  return best ?? Math.min(hi, Math.max(0, Math.round(raw)));
}
function evalAt(x, z, d) {
  let base = 0;
  for (let i = x; i < x + d.dl; i++) for (let k = z; k < z + d.dw; k++) base = Math.max(base, hm[i * nz + k]);
  let sup = 0;
  for (let i = x; i < x + d.dl; i++) for (let k = z; k < z + d.dw; k++) if (Math.abs(hm[i * nz + k] - base) < 1e-6) sup++;
  const ratio = sup / (d.dl * d.dw);
  let reason = "";
  if (d.dl > nx || d.dw > nz) reason = "这个方向放不进车厢，换个方向试试";
  else if (base + d.dh > Hc + 1e-6) reason = "超出车厢高度，放不下";
  else if (base > 0 && ratio < 0.7) reason = "下方支撑不够，货物会悬空，挪一挪位置";
  return { x, z, y: base, valid: !reason, reason };
}

// ---------- 货物网格 ----------
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
function makeBoxMesh(b) {
  const m = new THREE.Group();
  m.add(cargoTemplate(b.type).clone());
  m.quaternion.copy(orientQuat(b));
  const hit = new THREE.Mesh(cargoGeo(b.type), hitMat); // 点选用的包围盒
  hit.userData.box = b;
  m.add(hit);
  const hl = new THREE.Mesh(cargoGeo(b.type), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.35, depthWrite: false }));
  hl.scale.setScalar(1.02);
  hl.visible = false;
  m.add(hl);
  m.userData = { box: b, hl, hit };
  m.position.set((b.x + b.dl / 2) * G, (b.y + b.dh / 2) * G, (b.z + b.dw / 2) * G);
  b.mesh = m;
  boxGroup.add(m);
  return m;
}
function clearBoxMeshes() {
  for (const m of [...boxGroup.children]) {
    boxGroup.remove(m);
    m.userData.hl.material.dispose();
  }
}

// 幽灵框（正在放置的货物）
let ghost = null;
function rebuildGhost() {
  if (ghost) {
    root.remove(ghost);
    ghost.children.forEach((c) => c.material.dispose());
    ghost.material.forEach?.((m) => m.dispose());
    ghost = null;
  }
  if (!selType) return;
  const mats = cargoMats(selType).map((m) => {
    const c = m.clone();
    c.transparent = true;
    c.opacity = 0.72;
    c.depthWrite = false;
    return c;
  });
  ghost = new THREE.Mesh(cargoGeo(selType), mats);
  ghost.quaternion.copy(orientQuat(orient));
  const tint = new THREE.Mesh(cargoGeo(selType), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.25, depthWrite: false }));
  tint.scale.setScalar(1.02);
  const edge = new THREE.LineSegments(cargoEdges(selType), new THREE.LineBasicMaterial({ color: 0x16a34a }));
  edge.scale.setScalar(1.02);
  ghost.add(tint, edge);
  ghost.userData = { tint, edge };
  ghost.visible = false;
  root.add(ghost);
}
function placeGhost() {
  if (!ghost || !ghostPos) { if (ghost) ghost.visible = false; return; }
  const d = orientDims(selType, orient);
  ghost.visible = true;
  ghost.position.set((ghostPos.x + d.dl / 2) * G, (ghostPos.y + d.dh / 2) * G, (ghostPos.z + d.dw / 2) * G);
  const col = ghostPos.valid ? 0x22c55e : 0xef4444;
  ghost.userData.tint.material.color.setHex(col);
  ghost.userData.edge.material.color.setHex(ghostPos.valid ? 0x16a34a : 0xdc2626);
}

// ---------- 规则检查与指标 ----------
const overlap = (a, b) => a.x < b.x + b.dl && b.x < a.x + a.dl && a.z < b.z + b.dw && b.z < a.z + a.dw;
function analyze() {
  const c = cont();
  const boxes = state().boxes;
  let kg = 0, vol = 0, mx = 0, my = 0, mz = 0;
  for (const b of boxes) {
    const t = CARGO[b.type];
    kg += t.kg;
    vol += t.vol;
    mx += t.kg * (b.x + b.dl / 2) * G;
    my += t.kg * (b.y + b.dh / 2) * G;
    mz += t.kg * (b.z + b.dw / 2) * G;
  }
  const cog = kg ? { x: mx / kg, y: my / kg, z: mz / kg } : null;
  const viol = [];
  for (const b of boxes) {
    const t = CARGO[b.type];
    if (t.up && b.tip) viol.push({ ids: [b.id], text: `${t.name}标有“不可倒置”，却被放倒了` });
    if (b.y === 0) continue;
    for (const s of boxes) {
      if (s === b || s.y + s.dh !== b.y || !overlap(b, s)) continue;
      const u = CARGO[s.type];
      if (u.fragile) viol.push({ ids: [b.id, s.id], text: `易碎的${u.name}上面压了${t.name}` });
      else if (t.kg > u.kg) viol.push({ ids: [b.id, s.id], text: `重压轻：${t.name}（${t.kg} kg）压在${u.name}（${u.kg} kg）上` });
    }
  }
  if (kg > c.payload) viol.push({ ids: [], text: `超载：${(kg / 1000).toFixed(1)} 吨，超过限重 ${(c.payload / 1000).toFixed(1)} 吨` });
  const cap = c.L * c.W * c.H;
  const dx = cog ? cog.x - c.L / 2 : 0, dz = cog ? cog.z - c.W / 2 : 0;
  return {
    kg, vol, cap, wr: kg / c.payload, vr: vol / cap, cog, dx, dz,
    limX: LIM * c.L, limZ: LIM * c.W,
    cogOk: !cog || (Math.abs(dx) <= LIM * c.L && Math.abs(dz) <= LIM * c.W),
    viol,
  };
}

function scoreLevel(a) {
  const task = TASKS[levelIdx];
  let tk = 0, tv = 0;
  for (const [k, n] of Object.entries(task.items)) { tk += CARGO[k].kg * n; tv += CARGO[k].vol * n; }
  const load = Math.round(50 * ((a.kg / tk + a.vol / tv) / 2));
  const rule = Math.max(0, 30 - 10 * a.viol.length);
  let cog = 0;
  if (a.cog) {
    const f = Math.max(Math.abs(a.dx) / a.limX, Math.abs(a.dz) / a.limZ);
    cog = f <= 1 ? 20 : Math.round(20 * Math.max(0, 2 - f));
  }
  const left = [];
  for (const [k, n] of Object.entries(task.items)) {
    const r = n - state().boxes.filter((b) => b.type === k).length;
    if (r > 0) left.push(`${CARGO[k].name} ${r} 件`);
  }
  return { load, rule, cog, total: a.kg ? load + rule + cog : 0, left };
}

// ---------- 界面 ----------
const $ = (id) => document.getElementById(id);
const fmtT = (kg) => (kg / 1000).toFixed(kg >= 10000 ? 1 : 2) + " t";
const pct = (r) => Math.round(r * 100) + "%";

function remaining(key) {
  if (mode === "free") return Infinity;
  return (TASKS[levelIdx].items[key] || 0) - state().boxes.filter((b) => b.type === key).length;
}

function renderTop() {
  document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  $("contSel").style.display = mode === "free" ? "" : "none";
  $("levelSeg").style.display = mode === "task" ? "" : "none";
  $("contSel").value = free.container;
  $("levelSeg").innerHTML = TASKS.map(
    (t, i) => `<button data-level="${i}" class="${i === levelIdx ? "on" : ""}">${t.short}${levels[i].best != null ? `<span class="sc">${levels[i].best}分</span>` : ""}</button>`
  ).join("");
}

function renderCargo() {
  const c = cont();
  const ratio = c.payload / (c.L * c.W * c.H); // 箱子每立方米可分到的载重
  const keys = mode === "free" ? Object.keys(CARGO) : Object.keys(TASKS[levelIdx].items);
  $("cargoHint").textContent = mode === "free" ? "数量不限" : "剩余件数";
  $("cargoList").innerHTML = keys
    .map((k) => {
      const t = CARGO[k];
      const r = remaining(k);
      const dens = t.kg / t.vol;
      const chips = [dens > ratio ? `<span class="chip heavy">重货</span>` : `<span class="chip light">轻泡货</span>`];
      if (t.up) chips.push(`<span class="chip up">不可倒置</span>`);
      if (t.fragile) chips.push(`<span class="chip frag">易碎</span>`);
      return `<div class="cargo ${selType === k ? "on" : ""} ${r <= 0 ? "empty" : ""}" data-k="${k}">
        <div class="sw" style="background:#${new THREE.Color(t.color).getHexString()}"></div>
        <div style="flex:1;min-width:0">
          <div class="nm"><span>${t.name}</span>${r === Infinity ? "" : `<b>×${r}</b>`}</div>
          <div class="sub">${t.dims.join("×")} m · ${t.kg} kg</div>
          <div class="chips">${chips.join("")}</div>
        </div></div>`;
    })
    .join("");
}

let lastA = null;
function renderStats() {
  const a = (lastA = analyze());
  const c = cont();
  if (mode === "task") {
    const t = TASKS[levelIdx];
    $("goalBox").innerHTML = `<div class="goal"><b>${t.title}</b><br>${t.goal}<br><span style="color:#64748b">提示：${t.tip}</span></div>`;
  } else {
    $("goalBox").innerHTML = `<div class="goal"><b>${c.name}</b><br>内尺寸 ${c.L}×${c.W}×${c.H} m，容积 ${(c.L * c.W * c.H).toFixed(1)} m³，限重 ${fmtT(c.payload)}</div>`;
  }
  const barCol = (r) => (r > 1 ? "#ef4444" : r > 0.9 ? "#f59e0b" : "#22c55e");
  $("wTxt").textContent = `${fmtT(a.kg)} / ${fmtT(c.payload)} · ${pct(a.wr)}`;
  $("vTxt").textContent = `${a.vol.toFixed(1)} / ${a.cap.toFixed(1)} m³ · ${pct(a.vr)}`;
  $("wBar").style.width = Math.min(100, a.wr * 100) + "%";
  $("wBar").style.background = barCol(a.wr);
  $("vBar").style.width = Math.min(100, a.vr * 100) + "%";
  $("vBar").style.background = barCol(a.vr);
  let ins = "还没装货。选左边的货物，放进车厢里。";
  if (a.kg) {
    const gap = a.wr - a.vr;
    if (a.wr > 1) ins = "已经超载了，必须卸下一些重货。";
    else if (gap > 0.25) ins = "现在偏“重”：载重用得快，空间还剩很多，可以多搭配轻泡货。";
    else if (gap < -0.25) ins = "现在偏“轻”：空间占得多，载重还很富余，可以搭配一些重货。";
    else ins = "轻重搭配比较均衡，载重和空间同步在用。";
  }
  $("insight").textContent = ins;
  if (a.cog) {
    const dirX = a.dx > 0 ? "偏向门端" : "偏向里端";
    const dirZ = "偏向一侧";
    $("cogTxt").innerHTML =
      `纵向：${Math.abs(a.dx) < 0.005 ? "居中" : `${dirX} ${Math.abs(a.dx).toFixed(2)} m`}（允许 ±${a.limX.toFixed(2)}）${Math.abs(a.dx) <= a.limX ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}<br>` +
      `横向：${Math.abs(a.dz) < 0.005 ? "居中" : `${dirZ} ${Math.abs(a.dz).toFixed(2)} m`}（允许 ±${a.limZ.toFixed(2)}）${Math.abs(a.dz) <= a.limZ ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}`;
  } else $("cogTxt").textContent = "装货后显示重心位置。";
  $("viol").innerHTML = a.viol.length
    ? a.viol.map((v) => `<li>${v.text}</li>`).join("")
    : `<li class="none">${a.kg ? "没有发现违规，继续保持。" : "装货后会自动检查：重压轻、易碎品受压、倒置、超载。"}</li>`;
  $("submitBox").innerHTML = mode === "task" ? `<button class="btn primary" id="submitBtn">提交本关，查看得分</button>` : "";
  drawMini(a);
  // 三维高亮
  const bad = new Set(a.viol.flatMap((v) => v.ids));
  for (const m of boxGroup.children) {
    const b = m.userData.box;
    m.userData.hl.visible = bad.has(b.id) || picked === b;
    m.userData.hl.material.color.setHex(picked === b ? 0xfacc15 : 0xef4444);
  }
  cogGroup.visible = !!a.cog;
  if (a.cog) {
    cogBall.position.set(a.cog.x, a.cog.y, a.cog.z);
    cogDot.position.set(a.cog.x, 0.015, a.cog.z);
    cogLine.geometry.setFromPoints([new THREE.Vector3(a.cog.x, 0.015, a.cog.z), new THREE.Vector3(a.cog.x, a.cog.y, a.cog.z)]);
    cogBall.material.color.setHex(a.cogOk ? 0x16a34a : 0xdc2626);
    cogDot.material.color.setHex(a.cogOk ? 0x16a34a : 0xdc2626);
    cogLine.material.color.setHex(a.cogOk ? 0x16a34a : 0xdc2626);
  }
}

function drawMini(a) {
  const cv = $("mini");
  const c = cont();
  const W = cv.clientWidth || 238;
  const pad = 14;
  const s = (W - pad * 2) / c.L;
  const H = Math.round(c.W * s + pad * 2);
  const dpr = Math.min(devicePixelRatio, 2);
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.height = H + "px";
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#e9d5b3";
  g.fillRect(pad, pad, c.L * s, c.W * s);
  const boxes = [...state().boxes].sort((p, q) => p.y + p.dh - (q.y + q.dh));
  for (const b of boxes) {
    const col = new THREE.Color(CARGO[b.type].color);
    const k = 0.6 + 0.4 * ((b.y + b.dh) / Hc);
    g.fillStyle = `rgb(${col.r * 255 * k},${col.g * 255 * k},${col.b * 255 * k})`;
    g.fillRect(pad + b.x * G * s, pad + b.z * G * s, b.dl * G * s, b.dw * G * s);
    g.strokeStyle = "rgba(15,23,42,.45)";
    g.lineWidth = 1;
    g.strokeRect(pad + b.x * G * s + 0.5, pad + b.z * G * s + 0.5, b.dl * G * s - 1, b.dw * G * s - 1);
  }
  g.strokeStyle = "#334155";
  g.lineWidth = 1.5;
  g.strokeRect(pad, pad, c.L * s, c.W * s);
  // 允许范围
  g.setLineDash([4, 3]);
  g.strokeStyle = "#16a34a";
  g.lineWidth = 1.5;
  g.strokeRect(pad + (0.5 - LIM) * c.L * s, pad + (0.5 - LIM) * c.W * s, 2 * LIM * c.L * s, 2 * LIM * c.W * s);
  g.setLineDash([]);
  g.fillStyle = "#64748b";
  g.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText("里端", pad, pad / 2 + 1);
  g.textAlign = "right";
  g.fillText("门端", pad + c.L * s, pad / 2 + 1);
  if (a.cog) {
    const x = pad + a.cog.x * s, y = pad + a.cog.z * s;
    g.fillStyle = a.cogOk ? "#16a34a" : "#dc2626";
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

function renderAction(msg) {
  const bar = $("actionBar");
  if (selType) {
    const t = CARGO[selType];
    const r = remaining(selType);
    const warn = ghostPos && !ghostPos.valid ? ghostPos.reason : "";
    bar.innerHTML =
      `<span class="msg ${warn ? "warn" : ""}">${warn || msg || `正在放：<b>${t.name}</b>${r === Infinity ? "" : `（剩 ${r} 件）`}，移到车厢里单击放下`}</span>` +
      `<button class="btn" data-act="yaw">水平旋转<kbd>R</kbd></button>` +
      `<button class="btn" data-act="tip">放倒<kbd>T</kbd></button>` +
      `<button class="btn primary" data-act="place" ${ghostPos?.valid ? "" : "disabled"}>放置</button>` +
      `<button class="btn" data-act="cancel">取消<kbd>Esc</kbd></button>`;
  } else if (picked) {
    const t = CARGO[picked.type];
    bar.innerHTML =
      `<span class="msg">已选中：<b>${t.name}</b> ${t.kg} kg，离地 ${(picked.y * G).toFixed(2)} m</span>` +
      `<button class="btn" data-act="remove">取出</button><button class="btn" data-act="unpick">取消</button>`;
  } else {
    bar.innerHTML =
      `<span class="msg ${msg ? "" : "hint"}">${msg || "点左侧货物开始装货 · 拖动旋转视角 · 滚轮缩放 · 点已装的货可以取出"}</span>` +
      `<button class="btn" data-act="undo" ${state().boxes.length ? "" : "disabled"}>撤销</button>` +
      `<button class="btn danger" data-act="clear" ${state().boxes.length ? "" : "disabled"}>${mode === "task" ? "重做本关" : "清空"}</button>`;
  }
}

let toastT = 0;
function toast(s) {
  const el = $("toast");
  el.textContent = s;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2200);
}

function refresh() {
  renderTop();
  renderCargo();
  renderStats();
  renderAction();
}

// ---------- 操作 ----------
function selectType(k) {
  if (remaining(k) <= 0) { toast("这种货物已经装完了"); return; }
  picked = null;
  if (selType === k) { selType = null; ghostPos = null; }
  else { selType = k; orient = { yaw: 0, tip: 0 }; ghostPos = null; }
  rebuildGhost();
  refresh();
}
function cancelSel() {
  selType = null;
  ghostPos = null;
  picked = null;
  rebuildGhost();
  refresh();
}
function rotate(kind) {
  if (!selType) return;
  if (kind === "yaw") orient.yaw ^= 1;
  else orient.tip = (orient.tip + 1) % 3;
  if (kind === "tip" && orient.tip && CARGO[selType].up) toast("注意：这件货标有“不可倒置”");
  rebuildGhost();
  if (lastPointer) updateGhostFrom(lastPointer);
  else renderAction();
}
function placeNow() {
  if (!selType || !ghostPos?.valid) return;
  const d = orientDims(selType, orient);
  const b = { id: nextId++, type: selType, x: ghostPos.x, y: ghostPos.y, z: ghostPos.z, ...d, yaw: orient.yaw, tip: orient.tip };
  state().boxes.push(b);
  stamp(b);
  makeBoxMesh(b).userData.drop = 0; // 新放的货物有一个轻轻落下的动画
  if (remaining(selType) <= 0) { selType = null; rebuildGhost(); }
  ghostPos = null;
  if (ghost) ghost.visible = false;
  refresh();
  if (lastPointer && selType) updateGhostFrom(lastPointer);
}
function removeBox(b) {
  const st = state();
  const above = st.boxes.some((o) => o !== b && o.y === b.y + b.dh && overlap(o, b));
  if (above) { toast("上面还压着货，要先把上面的取出来"); return; }
  st.boxes.splice(st.boxes.indexOf(b), 1);
  boxGroup.remove(b.mesh);
  b.mesh.userData.hl.material.dispose();
  picked = null;
  rebuildHM();
  refresh();
}
function undo() {
  const st = state();
  if (st.boxes.length) removeBox(st.boxes[st.boxes.length - 1]);
}
function clearAll() {
  if (!confirm(mode === "task" ? "清空本关已装的货物，重新开始？" : "清空车厢里的所有货物？")) return;
  state().boxes = [];
  loadScene();
}

function loadScene() {
  selType = null;
  picked = null;
  ghostPos = null;
  buildEnv();
  clearBoxMeshes();
  rebuildHM();
  for (const b of state().boxes) makeBoxMesh(b);
  rebuildGhost();
  setView("iso", true);
  refresh();
}

// ---------- 视角 ----------
let camAnim = null;
let curView = "iso";
function setView(v, instant) {
  curView = v;
  const c = cont();
  const cx = 0, cy = c.H / 2 + root.position.y, cz = 0;
  const d = (Math.max(c.L, 5) * 1.2 + 2.5) * Math.max(1, 1.5 / camera.aspect);
  const pos = {
    iso: [c.L * 0.42, cy + d * 0.62, d * 0.8],
    top: [0, cy + d * 1.0, 0.01],
    side: [0, cy + 0.6, d * 1.05],
    door: [c.L / 2 + d * 0.5, cy + 1.6, 0.01],
  }[v];
  const to = new THREE.Vector3(...pos), tt = new THREE.Vector3(cx, v === "door" ? cy : cy - 0.4, cz);
  if (instant) {
    camera.position.copy(to);
    controls.target.copy(tt);
    camAnim = null;
  } else camAnim = { from: camera.position.clone(), ft: controls.target.clone(), to, tt, t: 0 };
  document.querySelectorAll("#viewSeg button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
}

// ---------- 指针 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastPointer = null;
let down = null;
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = [...boxGroup.children.map((m) => m.userData.hit), envGroup.getObjectByName("floor")];
  return ray.intersectObjects(targets, false)[0] || null;
}
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function updateGhostFrom(ev) {
  if (!selType) return;
  const d = orientDims(selType, orient);
  let px, pz;
  const hit = pick(ev);
  if (hit) {
    const p = root.worldToLocal(hit.point.clone());
    const n = hit.face ? hit.face.normal.clone().applyQuaternion(hit.object.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Vector3(0, 1, 0);
    px = p.x / G;
    pz = p.z / G;
    if (Math.abs(n.y) < 0.5) { px += (n.x * d.dl) / 2; pz += (n.z * d.dw) / 2; }
  } else {
    // 指到车厢外时，投影到地板平面
    floorPlane.constant = -root.position.y;
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, p)) return;
    root.worldToLocal(p);
    px = p.x / G;
    pz = p.z / G;
  }
  if (d.dl > nx || d.dw > nz) {
    ghostPos = { x: 0, z: 0, y: 0, valid: false, reason: "这个方向放不进车厢，换个方向试试" };
    if (ghost) ghost.visible = false;
    renderAction();
    return;
  }
  const boxes = state().boxes;
  const x = snapAxis(px - d.dl / 2, d.dl, nx, boxes.flatMap((b) => [b.x, b.x + b.dl]));
  const z = snapAxis(pz - d.dw / 2, d.dw, nz, boxes.flatMap((b) => [b.z, b.z + b.dw]));
  ghostPos = evalAt(x, z, d);
  placeGhost();
  renderAction();
}
canvas.addEventListener("pointermove", (ev) => {
  if (ev.pointerType === "mouse" && !(ev.buttons & 1)) {
    lastPointer = { clientX: ev.clientX, clientY: ev.clientY };
    updateGhostFrom(ev);
  }
});
canvas.addEventListener("pointerdown", (ev) => {
  down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
});
canvas.addEventListener("pointerup", (ev) => {
  if (!down) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
  const quick = performance.now() - down.t < 600;
  down = null;
  if (moved > 6 || !quick || ev.button !== 0) return;
  lastPointer = { clientX: ev.clientX, clientY: ev.clientY };
  if (selType) {
    if (ev.pointerType === "mouse") {
      updateGhostFrom(ev);
      if (ghostPos?.valid) placeNow();
      else if (ghostPos) toast(ghostPos.reason);
    } else updateGhostFrom(ev); // 触屏：点一下定位，再按“放置”
    return;
  }
  const hit = pick(ev);
  const b = hit?.object?.userData?.box;
  picked = b && picked !== b ? b : null;
  renderStats();
  renderAction();
});

// ---------- 事件绑定 ----------
$("contSel").innerHTML = Object.entries(CONTAINERS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join("");
$("contSel").addEventListener("change", (e) => {
  if (free.boxes.length && !confirm("换车型会清空已装的货物，确定吗？")) { e.target.value = free.container; return; }
  free.container = e.target.value;
  free.boxes = [];
  loadScene();
});
$("modeSeg").addEventListener("click", (e) => {
  const m = e.target.closest("button")?.dataset.mode;
  if (m && m !== mode) { mode = m; loadScene(); if (m === "task") showTaskIntro(); }
});
$("levelSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const i = +b.dataset.level;
  if (i !== levelIdx) { levelIdx = i; loadScene(); showTaskIntro(); }
});
$("viewSeg").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.view;
  if (v) setView(v);
});
$("cargoList").addEventListener("click", (e) => {
  const k = e.target.closest(".cargo")?.dataset.k;
  if (k) selectType(k);
});
$("actionBar").addEventListener("click", (e) => {
  const a = e.target.closest("button")?.dataset.act;
  if (!a) return;
  if (a === "yaw" || a === "tip") rotate(a);
  else if (a === "place") placeNow();
  else if (a === "cancel" || a === "unpick") cancelSel();
  else if (a === "remove" && picked) removeBox(picked);
  else if (a === "undo") undo();
  else if (a === "clear") clearAll();
});
$("statPanel").addEventListener("click", (e) => {
  if (e.target.id === "submitBtn") submitLevel();
});
$("statToggle").addEventListener("click", () => $("statPanel").classList.toggle("open"));
$("helpBtn").addEventListener("click", showHelp);
window.addEventListener("keydown", (e) => {
  if ($("modal").classList.contains("show")) {
    if (e.key === "Escape") closeModal();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === "r") rotate("yaw");
  else if (k === "t") rotate("tip");
  else if (k === "escape") cancelSel();
  else if ((k === "z" && (e.ctrlKey || e.metaKey)) || k === "backspace") { e.preventDefault(); undo(); }
  else if ((k === "delete") && picked) removeBox(picked);
});

// ---------- 弹窗 ----------
function openModal(html, acts) {
  $("dlg").innerHTML = html + `<div class="acts">${acts.map((a, i) => `<button class="btn ${a.primary ? "primary" : ""}" data-i="${i}">${a.label}</button>`).join("")}</div>`;
  $("dlg").querySelectorAll(".acts button").forEach((b) => b.addEventListener("click", () => { closeModal(); acts[+b.dataset.i].fn?.(); }));
  $("modal").classList.add("show");
}
function closeModal() { $("modal").classList.remove("show"); }

const CARDS = `
<div class="kgrid">
  <div class="kcard"><b>① 轻重配装</b><p>车和箱子有两个上限：<b>载重</b>和<b>容积</b>。重货（钢材、瓷砖）很快用完载重，却占不了多少空间；轻泡货（泡沫、棉被、家电）占满空间，载重还剩很多。两类搭配着装，才能让两个利用率都高。</p></div>
  <div class="kcard"><b>② 怎么判断重货、轻泡货</b><p>货物密度（重量÷体积）大于箱子的“限重÷容积”，就是重货，否则是轻泡货。例如 20GP：21.7 t ÷ 33.1 m³ ≈ 0.66 t/m³。左边货物卡片已经标好了。</p></div>
  <div class="kcard"><b>③ 重不压轻、大不压小</b><p>重的放下层，轻的放上层，否则下面的货会被压坏；重货在下还能让车辆重心低、行驶更稳。</p></div>
  <div class="kcard"><b>④ 易碎品和“不可倒置”</b><p>易碎品放最上层，上面不再压货。标有 ↑↑ 的货物（冰箱、机油桶等）必须按箭头朝上立着放。</p></div>
  <div class="kcard"><b>⑤ 重心居中</b><p>重货沿长度方向均匀铺开，左右对称。重心偏前或偏后会让某个车轴超载，偏向一侧容易侧翻。本模拟要求偏离中心不超过长、宽的 10%。</p></div>
  <div class="kcard"><b>⑥ 先里后外、码放紧密</b><p>从里端往门口依次装，货物之间靠紧，减少空隙，防止运输途中移动、倒塌。</p></div>
</div>`;
const OPS = `
<h4>两个利用率</h4>
<p>载重利用率 = 实装重量 ÷ 额定载重；容积利用率 = 货物总体积 ÷ 车厢容积。</p>
<h4>操作方法</h4>
<ul>
  <li>点左边的货物选中，把鼠标移到车厢里，<b>单击</b>放下（手机上点一下定位，再按“放置”）。</li>
  <li>放置前按 <b>R</b> 水平旋转、<b>T</b> 放倒；<b>Esc</b> 取消。货物靠近墙壁或其他货物时会自动贴齐。</li>
  <li>左键拖动旋转视角，右键拖动平移，滚轮缩放；也可以用右上角的“斜视 / 俯视 / 侧视 / 门端”。</li>
  <li>点已经装好的货物可以把它取出（上面压着货的要先取上面的）。</li>
</ul>`;
function showHelp() {
  openModal(`<span class="tag">知识点</span><h2>装车配载的基本原则</h2>${CARDS}${OPS}`, [{ label: "知道了", primary: true }]);
}
function showIntro() {
  openModal(
    `<span class="tag">互动仿真</span><h2>装车配载 3D 模拟</h2>
     <p>你是一名配载员，要把一批货物装进货车或集装箱。既要<b>装得多</b>（载重利用率、容积利用率高），又要<b>装得对</b>（重不压轻、易碎在上、不倒置、重心居中）。</p>
     <p style="margin-top:6px">可以先在<b>自由练习</b>里随便试，熟悉操作；准备好了再进<b>任务闯关</b>，三关各 100 分，总成绩取三关平均。配载原则随时可以点右上角“知识点”查看。</p>
     ${OPS}`,
    [
      { label: "自由练习", fn: () => { if (mode !== "free") { mode = "free"; loadScene(); } } },
      { label: "开始闯关", primary: true, fn: () => { mode = "task"; levelIdx = 0; loadScene(); showTaskIntro(); } },
    ]
  );
}
function showTaskIntro() {
  const t = TASKS[levelIdx];
  const c = CONTAINERS[t.container];
  const list = Object.entries(t.items).map(([k, n]) => `${CARGO[k].name} × ${n}`).join("、");
  openModal(
    `<span class="tag">${t.short} / 共 ${TASKS.length} 关</span><h2>${t.title}</h2>
     <p>${t.goal}</p>
     <p style="margin-top:6px"><b>车型：</b>${c.name}，内尺寸 ${c.L}×${c.W}×${c.H} m，限重 ${fmtT(c.payload)}<br><b>货物：</b>${list}</p>
     <h4>评分</h4>
     <table class="sc"><tr><td>装载完成度（装进去的重量、体积占这批货的比例）</td><td>50 分</td></tr>
     <tr><td>装载规范（每处违规扣 10 分）</td><td>30 分</td></tr>
     <tr><td>重心在允许范围内</td><td>20 分</td></tr></table>
     <p style="color:#64748b">提示：${t.tip}</p>`,
    [{ label: "开始装货", primary: true }]
  );
}

function post(msg) {
  try { parent.postMessage(msg, "*"); } catch { /* 单独打开时没有父页面 */ }
}
function submitLevel() {
  const a = analyze();
  if (!a.kg) { toast("还没有装货"); return; }
  const s = scoreLevel(a);
  const L = levels[levelIdx];
  L.best = Math.max(L.best ?? 0, s.total);
  const done = levels.filter((l) => l.best != null).length;
  const overall = Math.round(levels.reduce((sum, l) => sum + (l.best ?? 0), 0) / TASKS.length);
  post({ type: "tp:score", score: overall, max: 100, detail: { levels: levels.map((l, i) => ({ level: TASKS[i].title, best: l.best })) } });
  if (done === TASKS.length) post({ type: "tp:complete" });

  const tips = [];
  if (s.left.length) tips.push(`还有货没装上：${s.left.join("、")}。`);
  for (const v of a.viol) tips.push(v.text + "。");
  if (a.cog && Math.abs(a.dx) > a.limX) tips.push(`重心${a.dx > 0 ? "偏向门端" : "偏向里端"} ${Math.abs(a.dx).toFixed(2)} m，把部分重货往${a.dx > 0 ? "里端" : "门口"}挪。`);
  if (a.cog && Math.abs(a.dz) > a.limZ) tips.push(`重心偏向一侧 ${Math.abs(a.dz).toFixed(2)} m，两侧重货要对称摆放。`);
  if (!tips.length) tips.push("装得很好，没有问题！");
  const last = levelIdx === TASKS.length - 1;
  renderTop();
  openModal(
    `<span class="tag">${TASKS[levelIdx].title}</span><h2>本关得分</h2>
     <div class="score"><b>${s.total}</b><span>/ 100 分　（本关最好 ${L.best} 分）</span></div>
     <table class="sc">
       <tr><td>装载完成度</td><td>${s.load} / 50</td></tr>
       <tr><td>装载规范（${a.viol.length} 处违规）</td><td>${s.rule} / 30</td></tr>
       <tr><td>重心位置</td><td>${s.cog} / 20</td></tr>
       <tr><td>载重利用率 / 容积利用率</td><td>${pct(a.wr)} / ${pct(a.vr)}</td></tr>
     </table>
     <h4>点评</h4><ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
     <p style="margin-top:10px;color:#64748b">总成绩（三关平均，未完成的关按 0 分）：<b style="color:#0f172a">${overall} 分</b>，已完成 ${done}/${TASKS.length} 关。</p>`,
    [
      { label: "继续调整本关" },
      last ? { label: "完成", primary: true } : { label: "下一关", primary: true, fn: () => { levelIdx++; loadScene(); showTaskIntro(); } },
    ]
  );
}

// ---------- 循环 ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  for (const m of lineMats) m.resolution.set(w, h);
  if (lastA) drawMini(lastA);
  if (envGroup) setView(curView, true);
}
addEventListener("resize", resize);
// ---------- 环境动效（轻量）：飘动的旗子、掠过地面的云影、车厢里的浮尘 ----------
let amb = null;
function buildAmbient(g, L, W, H, gy, bx0, bz0) {
  // 旗杆和旗子
  const P = new Builder();
  P.add(new THREE.CylinderGeometry(0.04, 0.05, 4.2, 12), M.chrome, bx0 - 0.4, gy + 2.1, bz0 - 0.4, { hull: 0.008, line: false });
  P.add(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 20), M.steelGrey, bx0 - 0.4, gy + 0.06, bz0 - 0.4);
  g.add(P.build());
  const flagGeo = new THREE.PlaneGeometry(1.2, 0.75, 14, 6);
  flagGeo.translate(0.6, 0, 0);
  const flagTex = makeTex(256, 160, (f, w, h) => {
    f.fillStyle = "#2f6fed";
    f.fillRect(0, 0, w, h);
    f.fillStyle = "#fff";
    f.font = '700 40px "PingFang SC","Microsoft YaHei",sans-serif';
    f.textAlign = "center";
    f.textBaseline = "middle";
    f.fillText("物流实训", w / 2, h / 2);
  });
  const flag = new THREE.Mesh(flagGeo, std(0xffffff, { map: flagTex, side: THREE.DoubleSide, roughness: 0.8, polygonOffset: false }));
  flag.position.set(bx0 - 0.4, gy + 3.75, bz0 - 0.4);
  flag.castShadow = true;
  g.add(flag);
  // 云影
  const cloudTex = makeTex(128, 128, (f, w, h) => {
    const gr = f.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(30,40,60,.55)");
    gr.addColorStop(1, "rgba(30,40,60,0)");
    f.fillStyle = gr;
    f.fillRect(0, 0, w, h);
  });
  const clouds = [];
  for (let i = 0; i < 4; i++) {
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(9 + i * 2, 6 + i), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.16, depthWrite: false }));
    cm.rotation.x = -Math.PI / 2;
    cm.position.set(-30 + i * 17, gy + 0.02, W / 2 - 8 + i * 5.5);
    g.add(cm);
    clouds.push(cm);
  }
  // 车厢里的浮尘
  const n = 140, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([Math.random() * L, Math.random() * H, Math.random() * W], i * 3);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff6e0, size: 0.025, transparent: true, opacity: 0.55, depthWrite: false }));
  g.add(dust);
  amb = { flag, base: flagGeo.attributes.position.array.slice(), clouds, dust, L, W, H };
}
const timer = new THREE.Timer();
function ambientUpdate(t, dt) {
  if (!amb) return;
  const fp = amb.flag.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = amb.base[i * 3], y = amb.base[i * 3 + 1];
    const k = x / 1.2; // 离旗杆越远摆动越大
    fp.array[i * 3 + 2] = Math.sin(x * 4.2 - t * 5 + y * 0.8) * 0.09 * k;
    fp.array[i * 3 + 1] = y - k * k * 0.06 + Math.sin(x * 3 - t * 4) * 0.015 * k;
  }
  fp.needsUpdate = true;
  amb.flag.geometry.computeVertexNormals();
  for (const cm of amb.clouds) {
    cm.position.x += dt * 0.6;
    if (cm.position.x > amb.L + 30) cm.position.x = -35;
  }
  const dp = amb.dust.geometry.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    let y = dp.array[i * 3 + 1] + dt * 0.03 * (1 + (i % 5) * 0.3);
    if (y > amb.H) y = 0;
    dp.array[i * 3 + 1] = y;
    dp.array[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.02;
  }
  dp.needsUpdate = true;
  // 货物落下
  for (const m of boxGroup.children) {
    const d = m.userData.drop;
    if (d === undefined) continue;
    const nd = Math.min(1, d + dt * 4);
    m.userData.drop = nd >= 1 ? undefined : nd;
    const b = m.userData.box;
    const e = 1 - Math.pow(1 - nd, 3);
    m.position.y = (b.y + b.dh / 2) * G + (1 - e) * 0.35;
  }
  // 放置预览轻微呼吸
  if (ghost?.visible) ghost.userData.tint.material.opacity = 0.2 + 0.1 * Math.sin(t * 5);
}

function loop() {
  requestAnimationFrame(loop);
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  ambientUpdate(timer.getElapsed(), dt);
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + 0.06);
    const e = 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.from, camAnim.to, e);
    controls.target.lerpVectors(camAnim.ft, camAnim.tt, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  fadeUpdate();
  renderer.render(scene, camera);
}

resize();
loadScene();
loop();
showIntro();

// 自动化测试用：把车厢内坐标（米）换算成屏幕坐标
window.__sim = {
  project(x, y, z) {
    const v = root.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  },
  analyze,
  boxes: () => state().boxes.map(({ mesh, ...b }) => b),
};
