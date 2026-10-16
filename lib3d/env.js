// 环境：地面、道路、地面分区与标线、树、灯杆、锥桶、围栏、仓库/分拨中心厂房、办公楼、航站楼、云和飞鸟
import * as THREE from "three";
import { C, FONT, Kit, LINE_SOFT, STATS, canvasTex, glow, mat, rnd, shade, sign, used } from "./core.js";

// ---------- 地面 ----------
const GROUNDS = {
  concrete: { base: "#c9c6bd", joint: "rgba(90,88,80,.5)", n: 4, dot: [90, 90, 80] },     // 场站水泥地
  apron: { base: "#cbc8bf", joint: "rgba(90,88,80,.55)", n: 4, dot: [90, 90, 80] },        // 机坪
  asphalt: { base: "#7d8187", joint: null, n: 0, dot: [30, 30, 30] },                       // 沥青停车场
  floor: { base: "#c3c9c8", joint: "rgba(90,98,100,.28)", n: 2, dot: [80, 90, 90] },        // 库内环氧地坪
  grass: { base: "#8fbf6a", joint: null, n: 0, dot: [70, 130, 60] },
};
export function groundTex(kind = "concrete") {
  const G = GROUNDS[kind] ?? GROUNDS.concrete;
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = G.base; g.fillRect(0, 0, w, h);
    const [r, gg, b] = G.dot;
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r + rnd() * 60},${gg + rnd() * 50},${b + rnd() * 40},${0.04 + rnd() * 0.07})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 2 + rnd() * 5); }
    if (kind === "grass") for (let i = 0; i < 1800; i++) { g.fillStyle = rnd() > 0.5 ? "rgba(70,130,60,.25)" : "rgba(170,210,120,.25)"; g.fillRect(rnd() * w, rnd() * h, 2, 3 + rnd() * 4); }
    if (G.joint) { g.strokeStyle = G.joint; g.lineWidth = 2; for (let i = 0; i <= G.n; i++) { g.beginPath(); g.moveTo(i * w / G.n, 0); g.lineTo(i * w / G.n, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / G.n); g.lineTo(w, i * h / G.n); g.stroke(); } }
    for (let i = 0; i < 4; i++) { g.fillStyle = "rgba(60,55,50,.08)"; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 30, 8 + rnd() * 14, rnd() * 3, 0, 7); g.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 一块地面：ground({ w: 80, d: 60, kind: "concrete" | "apron" | "asphalt" | "floor" | "grass", tile: 8 })，顶面 y = 0
export function ground({ w = 80, d = 60, kind = "concrete", tile = 8, y = 0 } = {}) {
  const t = groundTex(kind); t.repeat.set(w / tile, d / tile);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }));
  m.position.y = y; m.receiveShadow = true;
  STATS.zones++;
  return m;
}

// 道路：road({ length: 100, width: 7, lanes: 2 })，沿 x 方向，带中心虚线、边线、路缘石；转 90° 用 rotation.y
export function road({ length = 100, width = 7, lanes = 2, sidewalk = 2 } = {}) {
  used("road");
  const g = new THREE.Group();
  const t = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = "#5b5f63"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(30,30,30,${rnd() * 0.14})`; c.fillRect(rnd() * w, rnd() * h, 3, 2); }
    c.fillStyle = "#f4f4f0"; c.fillRect(0, 6, w, 5); c.fillRect(0, h - 11, w, 5);
    for (let l = 1; l < lanes; l++) { const y = (h * l) / lanes; c.fillStyle = lanes === 2 ? "#f2c94c" : "#f4f4f0"; for (let x = 0; x < w; x += 128) c.fillRect(x + 10, y - 3, 70, 6); }
  });
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(length / 16, 1);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(length, width).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  r.position.y = 0.02; r.receiveShadow = true; g.add(r);
  if (sidewalk > 0) {
    const k = new Kit();
    for (const s of [-1, 1]) { k.box(length, 0.15, 0.25, 0xcbd5e1, 0, 0, s * (width / 2 + 0.12)); k.box(length, 0.12, sidewalk, 0xb6bcc4, 0, 0, s * (width / 2 + 0.25 + sidewalk / 2)); for (let x = -length / 2; x < length / 2; x += 1.5) k.box(0.02, 0.125, sidewalk, 0x9aa1aa, x, 0, s * (width / 2 + 0.25 + sidewalk / 2)); }
    k.build(g, { edges: false });
  }
  STATS.zones++;
  return g;
}

// 地面功能分区（彩色边框 + 半透明底色 + 区域名称）：zone({ w: 12, d: 8, name: "待装区", color: "#16a34a" })
// 这是“地面分区”的标准做法：场景里每个作业区都用 zone 标出来
let zoneLift = 0;
export function zone({ w = 10, d = 8, name = "", color = "#2563eb", fill = 0.1, text = 1, dashed = false } = {}) {
  used("zone");
  const PX = Math.min(48, Math.round(1600 / Math.max(w, d)));
  const t = canvasTex(Math.round(w * PX), Math.round(d * PX), (c, cw, ch) => {
    const a = Math.round(fill * 255).toString(16).padStart(2, "0");
    c.fillStyle = color + a; c.fillRect(0, 0, cw, ch);
    c.strokeStyle = color; c.lineWidth = Math.max(4, PX * 0.18);
    if (dashed) c.setLineDash([PX * 0.8, PX * 0.5]);
    c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, cw - c.lineWidth, ch - c.lineWidth);
    if (name) { c.setLineDash([]); c.fillStyle = color; c.font = `bold ${Math.round(PX * 0.9 * text)}px ${FONT}`; c.textBaseline = "top"; c.fillText(name, PX * 0.4, PX * 0.35, cw - PX * 0.8); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 - (zoneLift % 4) }));
  m.position.y = 0.012 + (zoneLift++ % 4) * 0.002; m.receiveShadow = true; m.renderOrder = 1;
  STATS.zones++;
  return m;
}
// 地面标线：markLine([[x,z], [x,z], ...], { color: 0xf2b705, width: 0.15, dashed: false })，返回 Group（原点在世界原点）
export function markLine(points, { color = C.yellow, width = 0.15, dashed = false, y = 0.03 } = {}) {
  used("markLine");
  const k = new Kit();
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1], L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    if (!dashed) k.add(new THREE.BoxGeometry(L + width, 0.01, width), color, (ax + bx) / 2, y, (az + bz) / 2, ry);
    else for (let s = 0; s < L; s += 1.6) { const f = (s + 0.5) / L; k.add(new THREE.BoxGeometry(Math.min(1, L - s), 0.01, width), color, ax + (bx - ax) * f, y, az + (bz - az) * f, ry); }
  }
  const g = new THREE.Group(); k.build(g, { edges: false, shadow: false });
  STATS.zones++;
  return g;
}
// 地面箭头（指示行驶/作业方向）：arrow({ color: "#ffffff", size: 2 })，默认指向 +x
export function arrow({ color = 0xffffff, size = 2 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(size / 2, 0); s.lineTo(0, size * 0.35); s.lineTo(0, size * 0.14); s.lineTo(-size / 2, size * 0.14); s.lineTo(-size / 2, -size * 0.14); s.lineTo(0, -size * 0.14); s.lineTo(0, -size * 0.35); s.lineTo(size / 2, 0);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.y = 0.025;
  STATS.zones++;
  return m;
}

// ---------- 小品：树、灯杆、锥桶、围栏、轮挡 ----------
const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 8), trunkE = new THREE.EdgesGeometry(trunkG, 40);
const leafMs = [0x5f9e4a, 0x74b35a, 0x4d8a45, 0x86b85e].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
// 树：tree({ s: 1 })（高约 5 m），树冠会随风轻摆（app 自动驱动）
export function tree({ s = 1 } = {}) {
  used("tree");
  const t = new THREE.Group();
  const tr = new THREE.Mesh(trunkG, mat(0x7a5a3c, { roughness: 1 })); tr.position.y = 1.3; tr.castShadow = true; tr.add(new THREE.LineSegments(trunkE, LINE_SOFT)); t.add(tr);
  const crown = new THREE.Group(); crown.position.y = 2.4; t.add(crown);
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const geo = new THREE.IcosahedronGeometry(1.15 + rnd() * 0.7, 0);
    const m = new THREE.Mesh(geo, leafMs[Math.floor(rnd() * 4)]); m.position.set((rnd() - 0.5) * 1.3, 0.8 + i * 0.75, (rnd() - 0.5) * 1.3); m.castShadow = true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), LINE_SOFT)); crown.add(m);
  }
  t.scale.setScalar(s);
  const ph = rnd() * 6;
  t.userData = { ambient: true, tick: (dt, time) => { crown.rotation.z = Math.sin(time * 1.3 + ph) * 0.03; crown.rotation.x = Math.cos(time * 1.1 + ph) * 0.02; } };
  STATS.ambient++;
  return t;
}
// 灯杆（高杆灯）：lamp({ h: 8 })，灯头朝 +x
export function lamp({ h = 8 } = {}) {
  used("lamp");
  const g = new THREE.Group(), k = new Kit();
  k.cyl(0.12, h, 0x94a3b8, 0, 0, 0, 8, 0.08); k.box(0.5, 0.3, 0.5, 0x64748b, 0, 0, 0);
  k.bar(0, h - 0.2, 0, 1.2, h, 0, 0.08, 0x94a3b8); k.box(0.7, 0.14, 0.32, 0x475569, 1.3, h - 0.08, 0);
  k.build(g, { angle: 30 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.26), glow(0xfff2c0, 0.6)); m.position.set(1.3, h - 0.1, 0); g.add(m);
  return g;
}
// 锥桶：cone()
export function cone({ color = C.orange } = {}) {
  const g = new THREE.Group(), k = new Kit();
  k.cyl(0.25, 0.75, color, 0, 0, 0, 10, 0.05); k.box(0.5, 0.06, 0.5, 0x1f2328, 0, 0, 0); k.cyl(0.19, 0.12, 0xf8fafc, 0, 0.35, 0, 10, 0.14);
  k.build(g, { angle: 30 });
  used("cone");
  return g;
}
// 围栏：fence({ length: 20, h: 1.8 })，沿 x
export function fence({ length = 20, h = 1.8, color = 0x64748b } = {}) {
  const k = new Kit();
  for (let x = -length / 2; x <= length / 2 + 0.01; x += 2.5) { k.box(0.08, h, 0.08, color, x, 0, 0); k.box(0.3, 0.2, 0.3, 0x94a3b8, x, 0, 0); }
  for (const y of [0.3, h - 0.1]) k.box(length, 0.05, 0.04, color, 0, y, 0);
  for (let x = -length / 2; x < length / 2; x += 0.25) k.box(0.015, h - 0.4, 0.015, shade(color, 1.2), x, 0.3, 0);
  const g = new THREE.Group(); k.build(g, { angle: 30 });
  used("fence");
  return g;
}

// ---------- 建筑 ----------
// 仓库 / 分拨中心 / 货站厂房：warehouse({ w: 40, d: 24, h: 9, doors: 5, dock: true, sign: "城东分拨中心", color: 0xe7ebef, band: 0x1f5f9e })
// 正面（有装卸门的一面）朝 +z；dock = 门前 1.2 m 高的装卸月台（带调节板和防撞胶）
// firstNo = 第一个门的编号（例如 4 → 门号 4、5、6…）；open = 开着的门的序号数组（从 0 数），例如 [0, 2]
// userData：roof（屋顶组）、front（正面墙组）、cutaway(true) 隐藏屋顶和正面墙露出库内、doorX（每个门的 x 坐标数组）、dockH（月台高度）
export function warehouse({ w = 40, d = 24, h = 9, doors = 5, dock = true, sign: signText = "", sub = "", color = 0xe7ebef, band = C.blue, open = [], firstNo = 1 } = {}) {
  used("warehouse");
  const g = new THREE.Group(), RIB = shade(color, 0.88), dockH = dock ? 1.2 : 0;
  const walls = new Kit();
  walls.box(w, h, 0.25, color, 0, 0, -d / 2);
  for (const s of [-1, 1]) walls.box(0.25, h, d, color, s * w / 2, 0, 0);
  for (let x = -w / 2 + 1.5; x < w / 2; x += 3) walls.box(0.25, h, 0.15, RIB, x, 0, -d / 2 + 0.2);
  for (const s of [-1, 1]) for (let z = -d / 2 + 1.5; z < d / 2; z += 3) walls.box(0.15, h, 0.25, RIB, s * (w / 2 + 0.05), 0, z);
  for (const s of [-1, 1]) walls.box(0.3, 1.4, d + 0.3, band, s * w / 2, h - 2.2, 0);
  walls.box(w + 0.3, 1.4, 0.3, band, 0, h - 2.2, -d / 2);
  // 库内地坪和柱子
  walls.box(w - 0.3, dockH + 0.02, d - 0.3, 0xb8bfc0, 0, 0, 0);
  for (let x = -w / 2 + 10; x < w / 2 - 2; x += 10) for (let z = -d / 2 + 8; z < d / 2 - 2; z += 8) { walls.box(0.5, h - dockH, 0.5, 0xd1d5db, x, dockH, z); walls.box(0.52, 1.2, 0.52, C.yellow, x, dockH, z); }
  walls.build(g, { angle: 30 });
  // 正面墙：门洞之间的墙垛 + 门楣
  const front = new THREE.Group(), fk = new Kit();
  const doorX = [], dw = 3.2, dh = 3.6;
  const gap = w / Math.max(1, doors);
  for (let i = 0; i < doors; i++) doorX.push(-w / 2 + gap * (i + 0.5));
  let x0 = -w / 2;
  for (const x of doorX) { const a = x - dw / 2; if (a > x0) fk.box(a - x0, h, 0.25, color, (x0 + a) / 2, 0, d / 2); fk.box(dw, h - dockH - dh, 0.25, color, x, dockH + dh, d / 2); x0 = x + dw / 2; }
  if (x0 < w / 2) fk.box(w / 2 - x0, h, 0.25, color, (x0 + w / 2) / 2, 0, d / 2);
  fk.box(w + 0.3, 1.4, 0.3, band, 0, h - 2.2, d / 2);
  doorX.forEach((x, i) => {
    const isOpen = open.includes(i) || open === true;
    if (!isOpen) { fk.box(dw, dh, 0.08, 0xb9c2cb, x, dockH, d / 2 + 0.05); for (let y = dockH + 0.3; y < dockH + dh; y += 0.3) fk.box(dw, 0.04, 0.1, 0x9aa3ad, x, y, d / 2 + 0.06); }
    fk.box(dw + 0.5, 0.35, 0.4, C.yellow, x, dockH + dh, d / 2 + 0.12);
    for (const s of [-1, 1]) fk.box(0.25, dh, 0.35, 0x1f2328, x + s * (dw / 2 + 0.15), dockH, d / 2 + 0.15); // 门封
  });
  fk.build(front, { angle: 30 });
  g.add(front);
  // 门编号
  doorX.forEach((x, i) => { const s = sign(`${i + firstNo}`, "", { w: 0.9, h: 0.6, bg: "#1f2937" }); s.position.set(x, dockH + dh + 0.4, d / 2 + 0.33); front.add(s); });
  // 装卸月台
  if (dock) {
    const k = new Kit();
    k.box(w, dockH, 3, 0xaab2b8, 0, 0, d / 2 + 1.5);
    for (let x = -w / 2; x < w / 2; x += 1) k.box(1, 0.12, 0.08, Math.round(x) % 2 ? C.yellow : 0x1f2328, x + 0.5, dockH - 0.12, d / 2 + 3.02);
    for (const x of doorX) { k.box(2.2, 0.05, 1.2, 0x6b7280, x, dockH, d / 2 + 2.4); for (const s of [-1, 1]) k.box(0.3, 0.5, 0.25, 0x111827, x + s * 1.2, dockH - 0.6, d / 2 + 3.1); }
    k.build(g, { angle: 30 });
  }
  // 屋顶：彩钢板 + 采光带
  const roof = new THREE.Group(), rk = new Kit();
  rk.box(w + 0.6, 0.4, d + 0.6, 0xa8b3bf, 0, h, 0);
  for (let z = -d / 2 + 3; z < d / 2; z += 5) rk.box(w - 2, 0.15, 1.6, 0x9fc3df, 0, h + 0.4, z);
  for (let x = -w / 2 + 4; x < w / 2 - 2; x += 8) { rk.box(1.4, 0.8, 1.4, 0xcbd5e1, x, h + 0.4, -d / 2 + 2); }
  rk.build(roof, { angle: 30 });
  g.add(roof);
  if (signText) { const s = sign(signText, sub, { w: Math.min(w * 0.6, 24), h: Math.min(2.4, h * 0.25), bg: "#" + band.toString(16).padStart(6, "0") }); s.position.set(0, h - 2.3, d / 2 + 0.35); front.add(s); }
  g.userData = { roof, front, doorX, dockH, width: w, depth: d, height: h, cutaway: (on) => { roof.visible = !on; front.visible = !on; } };
  return g;
}

// 办公楼 / 门岗：office({ w: 12, d: 10, floors: 3, color: 0xf3f5f7, sign: "调度中心" })
export function office({ w = 12, d = 10, floors = 3, color = 0xf3f5f7, glass = 0x2c4a63, sign: signText = "" } = {}) {
  used("office");
  const g = new THREE.Group(), k = new Kit(), fh = 3.4, h = floors * fh;
  k.box(w, h, d, color, 0, 0, 0);
  for (let f = 0; f < floors; f++) { const y = f * fh + 1.0; for (const s of [-1, 1]) { k.box(w + 0.04, 1.5, 0.05, glass, 0, y, s * (d / 2 + 0.01)); k.box(0.05, 1.5, d + 0.04, glass, s * (w / 2 + 0.01), y, 0); } for (let x = -w / 2 + 1.2; x < w / 2; x += 1.2) for (const s of [-1, 1]) k.box(0.08, 1.5, 0.08, color, x, y, s * (d / 2 + 0.02)); k.box(w + 0.1, 0.12, d + 0.1, shade(color, 0.9), 0, f * fh, 0); }
  k.box(w + 0.4, 0.5, d + 0.4, 0xa8b3bf, 0, h, 0);
  k.box(2.2, 2.6, 0.1, 0x1f3b57, 0, 0, d / 2 + 0.02); k.box(3.2, 0.2, 1.6, 0xcbd5e1, 0, 2.7, d / 2 + 0.8);
  for (let i = 0; i < 3; i++) k.box(1.2, 0.8, 1.0, 0xcbd5e1, -w / 2 + 2 + i * 1.6, h + 0.5, -d / 4);
  k.build(g, { angle: 30 });
  if (signText) { const s = sign(signText, "", { w: Math.min(w * 0.7, 8), h: 1 }); s.position.set(0, h - 0.9, d / 2 + 0.1); g.add(s); }
  return g;
}

// 机场航站楼/塔台（远景）：tower({ h: 38 })
export function tower({ h = 38 } = {}) {
  used("tower");
  const g = new THREE.Group(), k = new Kit();
  k.cyl(3.2, h, 0xe3e8ee, 0, 0, 0, 16, 2.4); k.cyl(5.5, 5, 0x5f8fb5, 0, h, 0, 16); k.cyl(6, 0.8, 0xdbe2e9, 0, h + 5, 0, 16); k.cyl(0.2, 6, 0x64748b, 0, h + 5.8, 0, 6);
  k.build(g, { angle: 30 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), glow(0xff3030, 1)); b.position.y = h + 12; g.add(b);
  g.userData = { tick: (dt, t) => { b.material.emissiveIntensity = (t % 1.5) < 0.2 ? 3 : 0.2; } };
  return g;
}

// ---------- 氛围：云、飞鸟 ----------
export function clouds({ n = 9, area = 400, y = 70 } = {}) {
  const g = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 5; j++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry((5 + rnd() * 4) * area / 400, 1), cm); m.position.set((j * 7 - 14) * area / 400, rnd() * 2, (rnd() - 0.5) * 6); c.add(m); }
    c.position.set((rnd() - 0.5) * area * 2, y + rnd() * y * 0.4, (rnd() - 0.5) * area * 2);
    c.userData.sp = (1.5 + rnd() * 2) * area / 400;
    g.add(c);
  }
  g.userData = { ambient: true, tick: (dt) => { for (const c of g.children) { c.position.x += c.userData.sp * dt; if (c.position.x > area * 1.2) c.position.x = -area * 1.2; } } };
  STATS.ambient += n;
  return g;
}
export function birds({ n = 8, r = 40, y = 25 } = {}) {
  const g = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, -0.4, 0, 1, 0.4, 0, 0.4, 0, 0, 0, -0.4, 0, -1, 0.4, 0, -0.4], 3));
  const m = new THREE.MeshBasicMaterial({ color: 0x334155, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) { const b = new THREE.Mesh(geo, m); b.userData = { r: r * (0.6 + rnd()), cx: (rnd() - 0.5) * r * 2, cz: (rnd() - 0.5) * r * 2, y: y + rnd() * y * 0.5, sp: 0.12 + rnd() * 0.1, ph: rnd() * 6 }; g.add(b); }
  g.userData = { ambient: true, tick: (dt, t) => { for (const b of g.children) { const u = b.userData, a = t * u.sp + u.ph; b.position.set(u.cx + Math.cos(a) * u.r, u.y + Math.sin(t * 0.7 + u.ph) * 1.5, u.cz + Math.sin(a) * u.r); b.rotation.y = -a; b.scale.y = 1; b.rotation.x = Math.sin(t * 9 + u.ph) * 0.5; } } };
  STATS.ambient += n;
  return g;
}
