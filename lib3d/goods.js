// 货物与仓储设备：托盘、纸箱、快件、托盘货、货架、驿站货架、输送机、笼车、集装箱（海运）、作业人员
import * as THREE from "three";
import { C, FONT, Kit, canvasTex, mat, pick, rnd, shade, textPlane, used, withEdges } from "./core.js";

const CARTON = [0xc99a5f, 0xd4a86b, 0xb98a52, 0xdcc19a];

// 木托盘 1.2×1.0 m，高 0.15 m：pallet({ color })
export function pallet({ color = C.wood, w = 1.2, d = 1.0 } = {}) {
  used("pallet");
  const g = new THREE.Group(), k = new Kit();
  palletParts(k, 0, 0, 0, w, d, color);
  k.build(g, { angle: 30 });
  g.userData = { height: 0.15 };
  return g;
}
function palletParts(k, x, y, z, w, d, color) {
  const dk = shade(color, 0.75);
  for (const s of [-1, 0, 1]) k.box(w, 0.025, 0.1, dk, x, y, z + s * (d / 2 - 0.05));
  for (const s of [-1, 0, 1]) for (const t of [-1, 0, 1]) k.box(0.14, 0.08, 0.12, dk, x + s * (w / 2 - 0.07), y + 0.025, z + t * (d / 2 - 0.06));
  for (let i = 0; i < 7; i++) k.box(0.12, 0.022, d, i % 2 ? color : shade(color, 1.08), x - w / 2 + 0.06 + i * (w - 0.12) / 6, y + 0.105, z);
  for (const s of [-1, 0, 1]) k.box(w, 0.022, 0.1, color, x, y + 0.083, z + s * (d / 2 - 0.05));
}

// 面单贴图
const sheetCache = new Map();
function sheetTex(code) {
  if (sheetCache.has(code)) return sheetCache.get(code);
  const t = canvasTex(160, 112, (c, w, h) => {
    c.fillStyle = "#fbfbf7"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#111"; c.font = `bold 26px ${FONT}`; c.textBaseline = "top"; c.fillText(code, 8, 6, w - 16);
    for (let i = 0; i < 44; i++) c.fillRect(10 + i * 3.2, 42, rnd() < 0.4 ? 3 : 1.5, 30);
    c.font = `12px ${FONT}`; c.fillText("收：** ***  寄：** ***", 8, 82);
  });
  sheetCache.set(code, t);
  return t;
}
// 纸箱（带封箱胶带和面单）：carton({ w: 0.5, h: 0.4, d: 0.4, color, code: "773-A01-12", label: "易碎" })
// 原点在箱底中心；userData.h 是高度（叠放用）
export function carton({ w = 0.5, h = 0.4, d = 0.4, color, code, label = "" } = {}) {
  used("carton");
  const g = new THREE.Group(), k = new Kit(), col = color ?? pick(CARTON);
  k.box(w, h, d, col, 0, 0, 0);
  k.box(w + 0.004, 0.004, Math.min(0.06, d * 0.2), 0xd9c8a2, 0, h, 0);
  k.box(0.004 + w, Math.min(0.06, h * 0.2), 0.004 + d * 0, 0xd9c8a2, 0, h * 0.9, d / 2);
  k.build(g, { angle: 30 });
  const sw = Math.min(w * 0.6, 0.22), sh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.7), new THREE.MeshStandardMaterial({ map: sheetTex(code ?? `77${Math.floor(rnd() * 9)}-A0${1 + Math.floor(rnd() * 8)}-${10 + Math.floor(rnd() * 80)}`), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }));
  sh.rotation.x = -Math.PI / 2; sh.position.set(-w * 0.15, h + 0.006, 0); g.add(sh);
  if (label) {
    const p = textPlane(Math.min(w * 0.7, 0.4), Math.min(h * 0.35, 0.14), (c, cw, ch) => { c.fillStyle = "#dc2626"; c.fillRect(0, 0, cw, ch); c.fillStyle = "#fff"; c.font = `bold ${ch * 0.62}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(label, cw / 2, ch / 2 + 2); }, { px: 256, py: 90 });
    p.position.set(0, h * 0.55, d / 2 + 0.004); g.add(p);
  }
  g.userData = { h, w, d, code };
  return g;
}
// 快递小件：parcel({ kind: "box" | "bag", code })（纸箱 0.3~0.6 m 或快递袋），原点在底面
export function parcel({ kind = "box", code } = {}) {
  used("parcel");
  if (kind === "bag") {
    const g = new THREE.Group();
    const w = 0.36 + rnd() * 0.12, h = 0.1, d = 0.28 + rnd() * 0.08;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 1, 2), mat(pick([0xe5e7eb, 0x9ca3af, 0x3b4a5f, 0xf3e7c9]), { roughness: 0.5 }));
    m.position.y = h / 2; m.scale.set(1, 1, 1); m.castShadow = true; withEdges(m); g.add(m);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), new THREE.MeshStandardMaterial({ map: sheetTex(code ?? "773-B02-11"), polygonOffset: true, polygonOffsetFactor: -4 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = h + 0.004; g.add(sh);
    g.userData = { h, w, d, code };
    return g;
  }
  const r = (a, b) => Math.round((a + rnd() * (b - a)) * 20) / 20;
  return carton({ w: r(0.3, 0.6), h: r(0.18, 0.4), d: r(0.24, 0.44), code });
}

// 托盘货（托盘 + 码好的纸箱 + 缠绕膜）：palletLoad({ layers: 3, color, film: true })，高约 0.15 + 0.35×层数
export function palletLoad({ layers = 3, color, film = true, w = 1.2, d = 1.0 } = {}) {
  used("palletLoad");
  const g = new THREE.Group(), k = new Kit(), col = color ?? pick(CARTON);
  palletParts(k, 0, 0, 0, w, d, C.wood);
  const bw = w / 3, bd = d / 2, bh = 0.35;
  for (let l = 0; l < layers; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
    k.box(bw - 0.02, bh - 0.01, bd - 0.02, (i + j + l) % 2 ? col : shade(col, 0.9), -w / 2 + bw * (i + 0.5), 0.15 + l * bh, -d / 2 + bd * (j + 0.5));
  for (let l = 0; l < layers; l++) k.box(w + 0.004, 0.03, 0.05, 0xd9c8a2, 0, 0.15 + l * bh + bh - 0.04, d / 2);
  k.build(g, { angle: 30 });
  if (film) {
    const H = layers * bh;
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, H * 0.92, d + 0.03), new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.28, roughness: 0.15, depthWrite: false }));
    f.position.y = 0.15 + H * 0.5; g.add(f);
  }
  g.userData = { height: 0.15 + layers * bh };
  return g;
}

// 横梁式托盘货架：rack({ bays: 3, levels: 3, fill: 0.7, code: "A" })
// 每个货位 2.7 m 宽（放 2 个托盘）、1.1 m 深、1.6 m 层高；沿 x 排列，正面朝 +z
// userData.slot(列, 层, 第几个托盘 0/1) 返回该货位托盘中心的局部坐标（Vector3），用来放货或做找货位的题
export function rack({ bays = 3, levels = 3, bayW = 2.7, depth = 1.1, levelH = 1.6, fill = 0.7, code = "A", color = 0x1d4ed8, beam = C.orange } = {}) {
  used("rack");
  const g = new THREE.Group(), k = new Kit(), W = bays * bayW, H = levels * levelH + 0.4;
  for (let b = 0; b <= bays; b++) for (const s of [-1, 1]) {
    const x = -W / 2 + b * bayW, z = s * depth / 2;
    k.box(0.09, H, 0.07, color, x, 0, z);
    for (let y = 0.1; y < H; y += 0.1) k.box(0.092, 0.02, 0.072, shade(color, 0.7), x, y, z);
    k.box(0.2, 0.02, 0.16, 0x475569, x, 0, z);
  }
  for (let b = 0; b <= bays; b++) { const x = -W / 2 + b * bayW; for (let y = 0.4; y < H; y += 0.9) k.bar(x, y, -depth / 2, x, y + 0.8, depth / 2, 0.03, shade(color, 0.85)); }
  const slots = [];
  for (let l = 0; l < levels; l++) {
    const y = 0.15 + l * levelH;
    for (const s of [-1, 1]) k.box(W, 0.12, 0.06, beam, 0, y - 0.12, s * (depth / 2 - 0.02));
    for (let b = 0; b < bays; b++) for (let i = 0; i < 2; i++) {
      const x = -W / 2 + b * bayW + bayW * (i + 0.5) / 2;
      slots.push([b, l, i, x, y]);
      if (rnd() < fill) {
        const layers = 2 + Math.floor(rnd() * 2), col = pick(CARTON);
        palletParts(k, x, y, 0, 1.2, depth - 0.1, C.wood);
        for (let n = 0; n < layers; n++) for (let a = 0; a < 2; a++) k.box(0.58, 0.33, depth - 0.14, (a + n) % 2 ? col : shade(col, 0.9), x - 0.3 + a * 0.6, y + 0.15 + n * 0.34, 0);
      }
    }
  }
  k.build(g, { angle: 30 });
  // 货位标签（例如 A-01-02：排-列-层）
  for (let b = 0; b < bays; b++) for (let l = 0; l < levels; l++) {
    const t = `${code}-${String(b + 1).padStart(2, "0")}-${String(l + 1).padStart(2, "0")}`;
    const p = textPlane(0.5, 0.12, (c, w, h) => { c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); c.fillStyle = "#111"; c.font = `bold ${h * 0.62}px monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, w / 2, h / 2 + 2); }, { px: 256, py: 64 });
    p.position.set(-W / 2 + b * bayW + bayW / 2, 0.15 + l * levelH - 0.06, depth / 2 + 0.02); g.add(p);
  }
  g.userData = { width: W, height: H, slot: (b, l, i = 0) => { const s = slots.find((q) => q[0] === b && q[1] === l && q[2] === i); return s ? new THREE.Vector3(s[3], s[4], 0) : null; } };
  return g;
}

// 轻型层板货架（快递驿站、拣货区）：shelf({ cols: 4, levels: 4, fill: 0.8, code: "A" })
// 每格 0.9 m 宽，0.45 m 深，0.42 m 高；正面朝 +z，每格有格口号（A-1-1 …）；userData.cell(列, 层) 返回格子中心局部坐标
export function shelf({ cols = 4, levels = 4, cellW = 0.9, depth = 0.45, cellH = 0.42, fill = 0.8, code = "A", color = 0x94a3b8 } = {}) {
  used("shelf");
  const g = new THREE.Group(), k = new Kit(), W = cols * cellW, H = levels * cellH + 0.12;
  for (const x of [-W / 2, W / 2]) for (const z of [-depth / 2, depth / 2]) { k.box(0.04, H, 0.04, shade(color, 0.7), x, 0, z); for (let y = 0.05; y < H; y += 0.05) k.box(0.042, 0.01, 0.042, shade(color, 0.5), x, y, z); }
  for (let c = 1; c < cols; c++) k.box(0.02, H - 0.1, depth, shade(color, 0.9), -W / 2 + c * cellW, 0.1, 0);
  for (let l = 0; l <= levels; l++) { const y = 0.1 + l * cellH; k.box(W, 0.025, depth, color, 0, y, 0); k.box(W, 0.05, 0.02, shade(color, 0.8), 0, y - 0.02, depth / 2); }
  for (let l = 0; l < levels; l++) for (let c = 0; c < cols; c++) {
    let x = -W / 2 + c * cellW + 0.06;
    const y = 0.125 + l * cellH;
    while (x < -W / 2 + (c + 1) * cellW - 0.18 && rnd() < fill) {
      const w = 0.14 + rnd() * 0.18, h = 0.1 + rnd() * (cellH - 0.16), d = 0.2 + rnd() * 0.18, bag = rnd() < 0.3;
      k.box(w, bag ? 0.06 : h, d, bag ? pick([0xe5e7eb, 0x3b4a5f, 0xf3e7c9]) : pick(CARTON), x + w / 2, y, -0.02);
      if (!bag) k.box(w * 0.5, 0.004, d * 0.5, 0xfbfbf7, x + w / 2, y + h, -0.02);
      x += w + 0.03;
    }
  }
  k.build(g, { angle: 30 });
  for (let l = 0; l < levels; l++) for (let c = 0; c < cols; c++) {
    const t = `${code}-${c + 1}-${levels - l}`;
    const p = textPlane(0.22, 0.06, (cv, w, h) => { cv.fillStyle = "#1f5f9e"; cv.fillRect(0, 0, w, h); cv.fillStyle = "#fff"; cv.font = `bold ${h * 0.7}px monospace`; cv.textAlign = "center"; cv.textBaseline = "middle"; cv.fillText(t, w / 2, h / 2 + 2); }, { px: 192, py: 52 });
    p.position.set(-W / 2 + c * cellW + cellW / 2, 0.09 + l * cellH, depth / 2 + 0.015); g.add(p);
  }
  g.userData = { width: W, height: H, cell: (c, l) => new THREE.Vector3(-W / 2 + c * cellW + cellW / 2, 0.125 + l * cellH, 0) };
  return g;
}

// 皮带输送机：conveyor({ length: 8, width: 0.8, height: 0.8, speed: 0.6, rollers: false })，沿 x 方向，皮带自动滚动
// userData.at(u) 返回皮带面上 u(0~1) 处的局部坐标（u=0 在 -x 端）；把快件 add 到输送机上，用 at() 摆位置
export function conveyor({ length = 8, width = 0.8, height = 0.8, speed = 0.6, rollers = false, color = 0x64748b, guard = C.yellow } = {}) {
  used("conveyor");
  const g = new THREE.Group(), k = new Kit(), L = length, W = width, top = height;
  for (const s of [-1, 1]) { k.box(L, 0.18, 0.06, color, 0, top - 0.2, s * (W / 2 + 0.03)); k.box(L, 0.06, 0.04, guard, 0, top + 0.02, s * (W / 2 + 0.07)); }
  for (const s of [-1, 1]) k.hcyl(0.1, W, 0x9aa3ad, s * L / 2, top - 0.1, 0, true, 12);
  const n = Math.max(2, Math.round(L / 2));
  for (let i = 0; i <= n; i++) { const x = -L / 2 + 0.2 + i * (L - 0.4) / n; for (const s of [-1, 1]) k.box(0.06, top - 0.2, 0.06, shade(color, 0.8), x, 0, s * (W / 2 - 0.02)); k.box(0.05, 0.05, W, shade(color, 0.8), x, 0.25, 0); for (const s of [-1, 1]) k.box(0.16, 0.03, 0.12, 0x334155, x, 0, s * (W / 2 - 0.02)); }
  if (rollers) for (let x = -L / 2 + 0.1; x < L / 2; x += 0.12) k.hcyl(0.035, W - 0.02, 0xb8c0c8, x, top - 0.04, 0, true, 8);
  k.build(g, { angle: 30 });
  let tex = null;
  if (!rollers) {
    tex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = "#2a2f36"; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(0, y, w, 3); c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(0, y + 3, w, 2); } });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, L);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    belt.rotation.set(-Math.PI / 2, 0, Math.PI / 2); belt.position.y = top; belt.receiveShadow = true; g.add(belt);
  }
  g.userData = {
    length: L, top, speed,
    at: (u) => new THREE.Vector3(-L / 2 + Math.max(0, Math.min(1, u)) * L, top + 0.005, 0),
    tick: (dt) => { if (tex) tex.offset.y -= dt * g.userData.speed; },
  };
  return g;
}

// 笼车（1.2×0.8×1.75 m）：cageCart({ bags: 4 })
export function cageCart({ bags = 0, color = 0x2f6fb5, bagColor = 0xf1efe8 } = {}) {
  used("cageCart");
  const g = new THREE.Group(), k = new Kit(), W = 1.2, D = 0.8, H = 1.6;
  k.box(W, 0.06, D, 0x9aa7b4, 0, 0.16, 0);
  for (const [u, v] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) { k.cyl(0.07, 0.07, 0x22262b, u, 0.02, v, 8); k.box(0.06, 0.08, 0.06, 0x475569, u, 0.08, v); }
  const cs = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  for (const [u, v] of cs) k.box(0.04, H, 0.04, color, u, 0.16, v);
  for (const y of [0.7, 1.2, 1.74]) for (let i = 0; i < 4; i++) { if (i === 3 && y < 1.7) continue; const [a, b] = cs[i], [c, d] = cs[(i + 1) % 4]; k.bar(a, y, b, c, y, d, 0.025, color); }
  for (let i = 0; i < 3; i++) for (let j = 1; j < 4; j++) { const [a, b] = cs[i], [c, d] = cs[i + 1], f = j / 4; k.bar(a + (c - a) * f, 0.2, b + (d - b) * f, a + (c - a) * f, 1.74, b + (d - b) * f, 0.014, 0x5b8fd0); }
  for (let b = 0; b < bags; b++) { const x = -0.3 + (b % 2) * 0.6, y = 0.52 + Math.floor(b / 2) * 0.52; k.add(new THREE.SphereGeometry(0.34, 9, 7), bagColor, x, y, 0, 0, 0, 0, 1, 0.85, 1); k.box(0.08, 0.14, 0.02, 0xfacc15, x + 0.1, y + 0.2, 0.34); }
  k.build(g, { angle: 30 });
  return g;
}

// 海运集装箱：container({ size: 20 | 40, color: 0xc2410c, text: "COSU 123456 7" })（20 尺 6.06 m / 40 尺 12.19 m，宽 2.44，高 2.59），沿 x，箱门在 -x 端
export function container({ size = 20, color = 0xc2410c, text = "" } = {}) {
  used("container");
  const g = new THREE.Group(), k = new Kit(), L = size === 40 ? 12.19 : 6.06, W = 2.44, H = 2.59, dk = shade(color, 0.72);
  k.box(L - 0.1, H - 0.2, W - 0.1, color, 0, 0.1, 0);
  for (let x = -L / 2 + 0.2; x < L / 2 - 0.1; x += 0.28) for (const s of [-1, 1]) k.box(0.13, H - 0.32, 0.04, shade(color, 1.08), x, 0.16, s * (W / 2 - 0.03));
  for (const s of [-1, 1]) for (const t of [-1, 1]) { k.box(0.16, H, 0.16, dk, s * (L / 2 - 0.08), 0, t * (W / 2 - 0.08)); }
  for (const y of [0, H - 0.14]) for (const t of [-1, 1]) k.box(L, 0.14, 0.12, dk, 0, y, t * (W / 2 - 0.06));
  for (const y of [0, H - 0.14]) k.box(0.14, 0.14, W, dk, -L / 2 + 0.07, y, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) for (const y of [0, H - 0.18]) k.box(0.18, 0.18, 0.18, 0x334155, s * (L / 2 - 0.09), y, t * (W / 2 - 0.09));
  // 箱门（-x 端）：锁杆 + 把手
  k.box(0.04, H - 0.3, W - 0.3, shade(color, 0.95), -L / 2 - 0.01, 0.15, 0);
  for (const z of [-0.85, -0.35, 0.35, 0.85]) { k.box(0.06, H - 0.4, 0.05, 0x9aa3ad, -L / 2 - 0.05, 0.2, z); k.box(0.08, 0.06, 0.18, 0x475569, -L / 2 - 0.08, 1.1, z + 0.08); }
  k.box(0.05, H - 0.3, 0.03, dk, -L / 2 - 0.03, 0.15, 0);
  k.build(g, { angle: 30 });
  if (text) for (const s of [-1, 1]) { const p = textPlane(Math.min(L * 0.5, 4.5), 0.5, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = `bold ${h * 0.6}px ${FONT}`; c.textBaseline = "middle"; c.fillText(text, 10, h / 2); }, { transparent: true, px: 768, py: 86 }); p.position.set(L * 0.1, H - 0.55, s * (W / 2 + 0.03)); if (s < 0) p.rotation.y = Math.PI; g.add(p); }
  g.userData = { length: L, width: W, height: H };
  return g;
}

// 作业人员（会走路、能摆手臂）：person({ vest: 0xf97316, hat: 0xfacc15 })，身高约 1.8 m，面朝 +x
// userData.walk(相位) 走路摆腿（app.moveAlong / path.place 会自动调用）；userData.pose(左臂, 右臂) 抬手（弧度，0 = 自然下垂，-1.5 = 向前平举）
export function person({ vest = C.orange, hat = 0xfacc15, pants = 0x334155, skin = 0xf1c9a5 } = {}) {
  used("person");
  const g = new THREE.Group(), legs = [], arms = [];
  const mk = (fn) => { const k = new Kit(); fn(k); const gg = new THREE.Group(); k.build(gg, { angle: 35 }); return gg; };
  for (const v of [-0.12, 0.12]) { const leg = mk((k) => { k.box(0.16, 0.85, 0.18, pants, 0, -0.85, 0); k.box(0.28, 0.1, 0.2, 0x1f2328, 0.04, -0.85, 0); }); leg.position.set(0, 0.85, v); g.add(leg); legs.push(leg); }
  g.add(mk((k) => {
    k.box(0.3, 0.62, 0.46, vest, 0, 0.85, 0);
    k.box(0.31, 0.05, 0.47, 0xe5e7eb, 0, 1.0, 0); k.box(0.31, 0.05, 0.47, 0xe5e7eb, 0, 1.2, 0);
    k.sphere(0.14, skin, 0, 1.63, 0);
    k.add(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 1.68, 0);
    k.box(0.2, 0.03, 0.3, hat, 0.08, 1.67, 0);
  }));
  for (const v of [-0.29, 0.29]) { const arm = mk((k) => { k.box(0.14, 0.58, 0.13, vest, 0, -0.58, 0); k.sphere(0.06, skin, 0, -0.62, 0, 8); }); arm.position.set(0, 1.46, v); g.add(arm); arms.push(arm); }
  g.userData = {
    legs, arms,
    walk: (ph) => { const a = 0.5; legs[0].rotation.z = Math.sin(ph) * a; legs[1].rotation.z = -Math.sin(ph) * a; arms[0].rotation.z = -Math.sin(ph) * a * 0.8; arms[1].rotation.z = Math.sin(ph) * a * 0.8; },
    pose: (a0 = 0, a1 = 0) => { arms[0].rotation.z = a0; arms[1].rotation.z = a1; legs[0].rotation.z = legs[1].rotation.z = 0; },
  };
  return g;
}

// 手持终端/扫描枪的小光束（扫描动作提示）：scanBeam() 返回一条红色光束，放在人手边，visible 控制
export function scanBeam(len = 0.8) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.08, len, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.z = Math.PI / 2; m.position.x = len / 2;
  const g = new THREE.Group(); g.add(m); g.visible = false;
  return g;
}

