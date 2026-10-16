// 航空：全货机/客机、集装器（AKE 集装箱、PMC 集装板、打好的板）、牵引车、拖斗、主舱平台车、传送带车
// 飞机沿 x 轴，机头朝 +x，左舷（主货舱门一侧）在 -z。单位米，原点在地面。
import * as THREE from "three";
import { FONT, Kit, canvasTex, glow, shade, textPlane, used, withEdges } from "./core.js";

export const AC = { R: 3.1, cy: 5.9, floorY: 4.9, lowerY: 3.2, nose: 31, tail: -33, door: { x0: -9.8, x1: -6.1, h: 2.9 } };
export const PMC = { L: 3.18, W: 2.44 };

function fuselageGeo(tailColor) {
  const { R, cy, nose, tail, door, floorY } = AC;
  const NX = 150, NA = 56, pos = [], col = [], idx = [];
  const cW = new THREE.Color(0xf6f7f9), cB = new THREE.Color(tailColor), cB2 = new THREE.Color(shade(tailColor, 1.5)), cG = new THREE.Color(0xc4cbd3), cWin = new THREE.Color(0x1b2a3a);
  const prof = (x) => {
    if (x > 21) { const t = Math.min(1, (x - 21) / (nose - 21)); return [R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.02 * t), cy - 0.95 * t * t]; }
    if (x < -11) { const t = Math.min(1, (-11 - x) / (-11 - tail)); return [R * (1 - 0.86 * Math.pow(t, 1.25)), cy + 2.35 * Math.pow(t, 1.5)]; }
    return [R, cy];
  };
  const xs = [];
  for (let i = 0; i <= NX; i++) xs.push(tail + (nose - tail) * (i / NX));
  for (const x of xs) {
    const [r, yc] = prof(x);
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * Math.PI * 2, ny = Math.cos(a), z = -Math.sin(a) * r;
      pos.push(x, yc + ny * r, z);
      let c = cW;
      if (ny < -0.42) c = cG; else if (ny < -0.1 && ny > -0.3) c = cB; else if (ny <= -0.3 && ny >= -0.42) c = cB2;
      if (x > nose - 4.4 && x < nose - 2.3 && ny > 0.25 && ny < 0.62 && Math.abs(z) < r * 0.85) c = cWin;
      col.push(c.r, c.g, c.b);
    }
  }
  const rowN = NA + 1;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < NA; j++) {
    const a = i * rowN + j, b = a + rowN;
    const xm = (xs[i] + xs[i + 1]) / 2, am = ((j + 0.5) / NA) * Math.PI * 2, ym = cy + Math.cos(am) * R, zm = -Math.sin(am) * R;
    if (xm > door.x0 && xm < door.x1 && zm < 0 && ym > floorY + 0.05 && ym < floorY + door.h) continue; // 主货舱门开口
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function wingGeo(side) {
  const s = new THREE.Shape();
  s.moveTo(9.6, 2.4); s.lineTo(-7.4, 31.5); s.lineTo(-9.4, 32.2); s.lineTo(-11.1, 31.8); s.lineTo(-5.2, 11.5); s.lineTo(-4.4, 2.4); s.lineTo(9.6, 2.4);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1, steps: 1 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), span = p.getY(i), d = p.getZ(i), t = (span - 2.4) / 29.8; p.setXYZ(i, x, 3.35 + t * 2.9 + (d - 0.5) * (0.95 * (1 - t) + 0.22 * t), side * span); }
  g.computeVertexNormals();
  return g;
}
function finGeo() {
  const s = new THREE.Shape();
  s.moveTo(-20.5, 0); s.lineTo(-29.2, 10.4); s.lineTo(-32.2, 10.4); s.lineTo(-33.2, 0); s.lineTo(-20.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
  g.translate(0, 8.05, -0.25);
  return g;
}
function stabGeo(side) {
  const s = new THREE.Shape();
  s.moveTo(-24.8, 0.8); s.lineTo(-31, 10.8); s.lineTo(-32.4, 10.8); s.lineTo(-33, 0.8); s.lineTo(-24.8, 0.8);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), sp = p.getY(i), d = p.getZ(i); p.setXYZ(i, x, 7.55 + sp * 0.1 + d, side * sp); }
  g.computeVertexNormals();
  return g;
}
function nacelle(k, x, y, z, color) {
  const pts = [[0, 1.55], [0.15, 1.72], [0.6, 1.8], [2.8, 1.78], [4.9, 1.45], [5.9, 1.1], [6.4, 0.95]].map(([u, r]) => new THREE.Vector2(r, -u));
  k.add(new THREE.LatheGeometry(pts, 28), 0xe9ecef, x, y, z, 0, 0, -Math.PI / 2);
  k.add(new THREE.CylinderGeometry(1.52, 1.52, 0.9, 28, 1, true), 0x5b6470, x - 0.45, y, z, 0, 0, Math.PI / 2);
  k.add(new THREE.CylinderGeometry(0.95, 0.7, 1.4, 20), 0xb8c0c8, x - 6.9, y, z, 0, 0, Math.PI / 2);
  k.add(new THREE.ConeGeometry(0.55, 1.2, 16), 0x6b7280, x - 8.0, y, z, 0, 0, Math.PI / 2);
  k.add(new THREE.BoxGeometry(6.5, 1.5, 0.5), 0xdfe3e8, x - 3.2, y + 1.9, z, 0, 0, -0.06);
  k.box(0.9, 0.05, 1.3, color, x - 1.4, y + 1.2, z);
}
function fan() {
  const k = new Kit();
  k.add(new THREE.ConeGeometry(0.42, 0.9, 16), 0x2a2f36, 0, 0, 0, 0, 0, -Math.PI / 2);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.add(new THREE.BoxGeometry(0.06, 1.1, 0.26), 0x3f4650, 0, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0, -a + 0.5, 0); }
  const g = new THREE.Group(); k.build(g, { angle: 40, shadow: false });
  return g;
}
function gear(k, x, z, nose) {
  if (nose) { k.cyl(0.13, 3.0, 0xcbd2d9, x, 0.55, z, 10); k.wheel(0.55, 0.36, x, 0.55, z - 0.3); k.wheel(0.55, 0.36, x, 0.55, z + 0.3); k.box(0.5, 1.2, 0.9, 0x8a939e, x, 2.6, z); return; }
  k.cyl(0.24, 3.0, 0xcbd2d9, x, 1.0, z, 12);
  k.box(4.2, 0.28, 0.3, 0x8a939e, x, 0.75, z);
  for (const dx of [-1.55, 0, 1.55]) for (const dz of [-0.55, 0.55]) k.wheel(0.63, 0.42, x + dx, 0.63, z + dz);
  k.add(new THREE.BoxGeometry(0.12, 2.6, 0.9), 0x9aa3ad, x + 0.7, 2.2, z, 0, 0, 0.35);
}

// 宽体全货机（长约 64 m，翼展约 64 m）：aircraft({ label: "示意全货机  CARGO", tail: 0x1f5f9e, pax: false })
// userData：setDoor(0~1) 主货舱门上翻（门在左舷 -z 侧，x ≈ -8，地板高 4.9 m）、fans（发动机风扇，自动转）、beacon（防撞灯，自动闪）
// 远景/背景飞机可用 aircraft({ lite: true })（不建舱门，零件更少）
export function aircraft({ label = null, tail = 0x1f5f9e, pax = false, lite = false } = {}) {
  used("aircraft");
  const group = new THREE.Group();
  const { R, cy, floorY, door } = AC;
  const fg = fuselageGeo(tail);
  const fus = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide }));
  fus.castShadow = true; fus.receiveShadow = true;
  fus.add(new THREE.LineSegments(new THREE.EdgesGeometry(fg, 20), new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.7 })));
  group.add(fus);
  // 外轮廓线：沿法线放大一点的反面网格
  const hullG = fg.clone();
  { const p = hullG.attributes.position, n = hullG.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * 0.05, p.getY(i) + n.getY(i) * 0.05, p.getZ(i) + n.getZ(i) * 0.05); }
  hullG.deleteAttribute("color");
  group.add(new THREE.Mesh(hullG, new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.BackSide })));
  const k = new Kit();
  for (const sd of [1, -1]) {
    k.add(wingGeo(sd), 0xdfe3e8);
    k.add(stabGeo(sd), 0xe9ecef);
    for (const sp of [8, 13, 18]) { const t = (sp - 2.4) / 29.8, xt = -4.6 - (sp - 11.5 > 0 ? (sp - 11.5) * 0.29 : 0); k.add(new THREE.CylinderGeometry(0.22, 0.05, 2.6, 8), 0xcfd5dc, xt - 0.4, 3.2 + t * 2.9, sd * sp, 0, 0, Math.PI / 2); }
    k.box(0.4, 0.2, 0.3, 0xe9ecef, -8.6, 6.3, sd * 32.1);
    nacelle(k, 6.2, 2.15, sd * 9.9, tail);
  }
  k.add(new THREE.CapsuleGeometry(2.35, 11, 6, 16), 0xe4e8ec, 1.8, 3.3, 0, 0, 0, Math.PI / 2, 0.55, 1, 1.28);
  k.add(finGeo(), tail);
  k.box(1.6, 0.6, 0.6, 0x2a2f36, -33.4, 8.3, 0);
  gear(k, 24.3, 0, true); gear(k, -1.6, 5.4, false); gear(k, -1.6, -5.4, false);
  k.box(1.1, 1.9, 0.04, 0xdfe3e8, 23.5, cy - 0.7, R - 0.05);
  k.box(3.0, 1.75, 0.04, 0xdfe3e8, 12, 3.05, R * 0.8);
  k.build(group, { angle: 25 });
  // 主货舱门
  const doorG = new THREE.Group();
  if (!lite && !pax) {
    const d = new Kit(), w = door.x1 - door.x0;
    d.box(w, door.h, 0.14, 0xf0f2f4, 0, -door.h, 0);
    for (let i = 1; i < 4; i++) d.box(w - 0.2, 0.08, 0.2, 0xcfd5dc, 0, -door.h * i / 4, 0.08);
    d.box(w, 0.35, 0.16, tail, 0, -door.h * 0.62, -0.01);
    d.build(doorG, { angle: 30 });
    // 舱内地板（开门后能看到）
    const n = new Kit();
    n.box(30, 0.16, 5.7, 0x8b949e, 5, floorY - 0.16, 0);
    for (let x = -10; x < 20; x += 0.8) for (const zz of [-0.82, 0, 0.82]) n.hcyl(0.05, 0.3, 0xb8c0c8, x, floorY + 0.03, zz, true, 6);
    n.build(group, { angle: 30, shadow: false });
  }
  doorG.position.set((door.x0 + door.x1) / 2, floorY + door.h + 0.05, -R + 0.25);
  group.add(doorG);
  const hex = "#" + tail.toString(16).padStart(6, "0");
  const txt = textPlane(10, 1.3, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = hex; c.font = `bold ${h * 0.62}px ${FONT}`; c.textBaseline = "middle"; c.fillText(label ?? (pax ? "示意客机" : "示意全货机  CARGO"), 10, h * 0.52); }, { transparent: true });
  txt.position.set(10, cy + (pax ? 1.75 : 1.35), -R + 0.33); txt.rotation.y = Math.PI; group.add(txt);
  const txt2 = txt.clone(); txt2.position.z = R - 0.33; txt2.rotation.y = 0; group.add(txt2);
  if (pax) {
    const wt = canvasTex(2048, 48, (c, w, h) => { c.clearRect(0, 0, w, h); for (let i = 0; i < 58; i++) { const x = 18 + i * (w - 36) / 57; if (i === 9 || i === 33) continue; c.fillStyle = "#c7d2de"; c.beginPath(); c.ellipse(x, h / 2, 11, 17, 0, 0, 7); c.fill(); c.fillStyle = "#1b2a3a"; c.beginPath(); c.ellipse(x, h / 2, 8, 14, 0, 0, 7); c.fill(); } });
    const wm = new THREE.MeshStandardMaterial({ map: wt, transparent: true, roughness: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const a = Math.acos(0.95 / R);
    for (const sd of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.42), wm); m.position.set(5.5, cy + Math.cos(a) * (R + 0.03), sd * Math.sin(a) * (R + 0.03)); m.rotation.x = sd * (a - Math.PI / 2); group.add(m); }
  }
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(0xff2020, 2)); navR.position.set(-8.6, 6.6, -32.1);
  const navG = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(0x20ff40, 2)); navG.position.set(-8.6, 6.6, 32.1);
  const beacon = glow(0xff3030, 0);
  const bTop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), beacon); bTop.position.set(4, cy + R + 0.1, 0);
  const bBot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), beacon); bBot.position.set(6, cy - R - 0.1, 0);
  group.add(navR, navG, bTop, bBot);
  const fans = [];
  for (const sd of [1, -1]) { const f = fan(); f.position.set(5.7, 2.15, sd * 9.9); group.add(f); fans.push(f); }
  group.userData = {
    doorG, fans, beacon, fanSpeed: 1.5,
    doorPos: new THREE.Vector3((door.x0 + door.x1) / 2, floorY, -R),
    setDoor: (f) => { doorG.rotation.x = -1.75 * Math.max(0, Math.min(1, f)); },
    tick(dt, t) { for (const f of fans) f.rotation.x += dt * group.userData.fanSpeed; beacon.emissiveIntensity = (t % 1.2) < 0.12 ? 3 : 0; },
  };
  return group;
}

// ---------- 集装器 ----------
function pmcParts(k, x, y, z, color = 0xb9c2cb) {
  k.box(PMC.L, 0.06, PMC.W, color, x, y, z);
  for (const s of [-1, 1]) { k.box(PMC.L + 0.06, 0.05, 0.08, shade(color, 0.72), x, y + 0.02, z + s * PMC.W / 2); k.box(0.08, 0.05, PMC.W, shade(color, 0.72), x + s * PMC.L / 2, y + 0.02, z); }
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) k.box(0.1, 0.04, 0.05, 0x5b6470, x + i * 0.44, y + 0.06, z + s * (PMC.W / 2 - 0.02));
}
function akeParts(k, x, y, z, ry = 0, color = 0xc9ced4) {
  // LD3（AKE）：底 1.56 m，顶 2.01 m，高 1.63 m，一侧斜角；深 1.53 m
  const s = new THREE.Shape();
  s.moveTo(-1.0, 0); s.lineTo(0.56, 0); s.lineTo(1.0, 0.7); s.lineTo(1.0, 1.63); s.lineTo(-1.0, 1.63); s.lineTo(-1.0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.53, bevelEnabled: false });
  g.translate(0, 0, -0.765);
  k.add(g, color, x, y, z, ry + Math.PI / 2);
  const c = Math.cos(ry), sn = Math.sin(ry);
  for (const u of [-0.6, 0, 0.6]) k.box(0.06, 1.6, 0.06, shade(color, 0.75), x + 0.78 * c, y, z - 0.78 * sn + u * c, ry);
  k.box(0.02, 1.2, 1.4, 0x3b6ea5, x + 0.775 * c, y + 0.2, z - 0.775 * sn - 0.2 * c, ry);
}
function codePlate(code, w = 0.9, h = 0.2) {
  return textPlane(w, h, (c, cw, ch) => { c.fillStyle = "#f8fafc"; c.fillRect(0, 0, cw, ch); c.strokeStyle = "#1e293b"; c.lineWidth = 4; c.strokeRect(2, 2, cw - 4, ch - 4); c.fillStyle = "#111"; c.font = `bold ${ch * 0.6}px monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(code, cw / 2, ch / 2 + 2); }, { px: 384, py: 86 });
}
// uld({ type: "AKE" | "PMC" | "PMC-loaded", code: "AKE12345CA", color, cover: "#2b5ea7" })
// AKE：集装箱（底 1.53×1.56 m，高 1.63 m）；PMC：空集装板（3.18×2.44 m）；PMC-loaded：打好的板（货物 + 防雨膜 + 网）
export function uld({ type = "AKE", code = "", color, height = 1.6, cover = 0x2b5ea7 } = {}) {
  used("uld");
  const g = new THREE.Group(), k = new Kit();
  if (type === "AKE") akeParts(k, 0, 0, 0, 0, color ?? 0xc9ced4);
  else {
    pmcParts(k, 0, 0, 0, color ?? 0xb9c2cb);
    if (type === "PMC-loaded") {
      const cols = [0xc8a270, 0xb88a55, 0xd4b27d, 0x9c7a4c];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.box(0.98, height * 0.45, 1.1, cols[(i + j) % 4], -1.05 + i * 1.05, 0.08, -0.58 + j * 1.16);
      k.box(3.0, height * 0.45, 2.3, cols[1], 0, 0.08 + height * 0.45, 0);
      k.box(3.08, height + 0.04, 2.36, cover, 0, 0.07, 0);
      for (let x = -1.4; x <= 1.4; x += 0.35) k.box(0.04, height + 0.08, 2.42, 0x111827, x, 0.06, 0);
      for (let y = 0.3; y < height; y += 0.35) k.box(3.14, 0.04, 2.42, 0x111827, 0, y, 0);
      for (let x = -1.4; x <= 1.4; x += 0.35) k.box(0.04, 0.04, 2.42, 0x111827, x, height + 0.1, 0);
    }
  }
  k.build(g, { angle: 30 });
  if (code) { const p = codePlate(code); if (type === "AKE") { p.position.set(0, 1.35, 0.775); } else { p.position.set(0, 0.22, PMC.W / 2 + 0.05); p.scale.setScalar(0.8); } g.add(p); }
  g.userData = { type, code, height: type === "AKE" ? 1.63 : type === "PMC" ? 0.1 : height + 0.1 };
  return g;
}

// 行李/货物牵引车（长约 3.2 m）：tug({ color })；userData.beacon 顶灯自动闪
export function tug({ color = 0x1f5f9e } = {}) {
  used("tug");
  const g = new THREE.Group(), k = new Kit();
  k.box(3.2, 0.8, 1.8, color, 0, 0.35, 0);
  k.box(1.2, 1.2, 1.7, shade(color, 1.1), -0.8, 1.15, 0);
  k.box(1.22, 0.55, 1.72, 0x28445c, -0.8, 1.6, 0);
  k.box(1.4, 0.08, 1.9, 0x334155, -0.8, 2.35, 0);
  for (const dx of [-1, 1]) for (const dz of [-0.9, 0.9]) k.wheel(0.4, 0.3, dx, 0.4, dz);
  k.box(0.6, 0.15, 0.2, 0x334155, -1.9, 0.45, 0);
  k.box(0.08, 0.14, 0.4, 0xfff7d6, 1.62, 0.8, 0.55); k.box(0.08, 0.14, 0.4, 0xfff7d6, 1.62, 0.8, -0.55);
  k.build(g, { angle: 30 });
  const beacon = glow(0xff9f1c, 1);
  const b = withEdges(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), beacon)); b.position.set(-0.8, 2.52, 0); g.add(b);
  g.userData = { beacon, hitchX: -2.1, tick: (dt, t) => { beacon.emissiveIntensity = Math.sin(t * 5) > 0.3 ? 1.6 : 0.1; } };
  return g;
}
// 集装器拖斗（3.4×2.7 m，台面高 0.6 m）：dolly({ load: null | "AKE" | "PMC" | "PMC-loaded" })
// 把 ULD 放到拖斗上：dolly.add(uld)，uld.position.y = 0.62
export function dolly({ load = null, code = "" } = {}) {
  used("dolly");
  const g = new THREE.Group(), k = new Kit();
  k.box(3.4, 0.25, 2.7, 0x5b6470, 0, 0.3, 0);
  for (let x = -1.5; x <= 1.5; x += 0.3) k.hcyl(0.04, 2.5, 0x9aa3ad, x, 0.57, 0, true, 6);
  k.box(0.08, 0.3, 2.7, 0xf2b705, 1.7, 0.55, 0); k.box(0.08, 0.3, 2.7, 0xf2b705, -1.7, 0.55, 0);
  for (const dx of [-1.2, 1.2]) for (const dz of [-1.2, 1.2]) k.wheel(0.26, 0.2, dx, 0.26, dz);
  k.box(1.4, 0.08, 0.1, 0x334155, 2.4, 0.35, 0);
  for (const dx of [-1.55, 1.55]) for (const dz of [-1.0, 1.0]) k.box(0.1, 0.18, 0.1, 0xdc2626, dx, 0.58, dz);
  k.build(g, { angle: 30 });
  if (load) { const u = uld({ type: load, code }); u.position.y = 0.62; g.add(u); g.userData.load = u; }
  g.userData.deckY = 0.62;
  return g;
}
// 主货舱升降平台车（长约 9.5 m，平台沿 z 方向）：loader()；userData.setH(高度 m) 升降平台（0.9 ~ 5）
// 对接飞机主货舱门时放在 (AC.door 中间 x, 0, -AC.R - 4.3)，setH(AC.floorY)
export function loader() {
  used("loader");
  const g = new THREE.Group(), k = new Kit();
  k.box(3.6, 0.7, 9.5, 0xf2b705, 0, 0.35, 0);
  for (const dx of [-1.5, 1.5]) for (const dz of [-3.8, 3.8]) k.wheel(0.45, 0.35, dx, 0.45, dz, false);
  k.box(1.3, 1.8, 1.6, 0xf8fafc, 2.5, 0.2, -3.6); k.box(1.32, 0.8, 1.62, 0x28445c, 2.5, 1.2, -3.6);
  k.build(g, { angle: 30 });
  const plat = new THREE.Group(), p = new Kit();
  p.box(3.6, 0.3, 7.6, 0xe0a800, 0, -0.3, 0);
  for (let z = -3.5; z <= 3.5; z += 0.5) p.hcyl(0.05, 3.3, 0x9aa3ad, 0, 0.02, z, false, 6);
  for (const dx of [-1.8, 1.8]) { p.box(0.06, 1.0, 7.6, 0xf2b705, dx, 0, 0); p.box(0.08, 0.08, 7.6, 0xf2b705, dx, 1.0, 0); for (let z = -3.6; z <= 3.6; z += 1.2) p.box(0.08, 1.0, 0.08, 0xf2b705, dx, 0, z); }
  p.box(3.6, 0.2, 1.2, 0xe0a800, 0, -0.2, 4.4);
  p.box(0.9, 1.1, 1.0, 0xf8fafc, 2.3, -0.3, 2.6); p.box(0.92, 0.5, 1.02, 0x28445c, 2.3, 0.2, 2.6);
  p.build(plat, { angle: 30 });
  g.add(plat);
  const sc = new THREE.Group();
  { const s = new Kit(); for (const dx of [-1.4, 1.4]) { s.add(new THREE.BoxGeometry(0.18, 0.2, 7.4), 0x6b7280, dx, 0, 0, 0, 0.5); s.add(new THREE.BoxGeometry(0.18, 0.2, 7.4), 0x6b7280, dx, 0, 0, 0, -0.5); } s.build(sc, { angle: 30, shadow: false }); }
  g.add(sc);
  const setH = (h) => { plat.position.y = h; const span = Math.max(0.3, h - 0.9); sc.position.y = 0.7 + span / 2; sc.scale.y = span / 3.6; };
  setH(0.9);
  g.userData = { plat, setH };
  return g;
}
// 下货舱传送带车（长约 7 m）：beltLoader()；userData.setAngle(弧度) 调皮带倾角
export function beltLoader() {
  used("beltLoader");
  const g = new THREE.Group(), k = new Kit();
  k.box(5, 0.8, 2, 0xf8fafc, 0, 0.3, 0);
  k.box(1.3, 1.3, 1.9, 0xf8fafc, -1.8, 1.1, 0); k.box(1.32, 0.6, 1.92, 0x28445c, -1.8, 1.6, 0);
  for (const x of [-1.7, 1.7]) for (const z of [-0.9, 0.9]) k.wheel(0.35, 0.25, x, 0.35, z);
  k.build(g, { angle: 30 });
  const belt = new THREE.Group(), b = new Kit();
  b.box(7, 0.18, 0.9, 0x334155, 3.5, -0.09, 0);
  for (const z of [-0.5, 0.5]) b.box(7, 0.35, 0.06, 0xf2b705, 3.5, 0, z);
  b.build(belt, { angle: 30 });
  belt.position.set(-2.2, 1.2, 0); belt.rotation.z = 0.2; g.add(belt);
  g.userData = { belt, setAngle: (a) => { belt.rotation.z = a; } };
  return g;
}
