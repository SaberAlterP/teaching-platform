// 车辆：厢式货车/冷藏车、牵引车 + 半挂车、快递面包车、无人配送车、叉车
// 统一约定：返回 THREE.Group，原点在地面、车身中心，车头朝 +x；group.userData 里是可动部件和方法。
import * as THREE from "three";
import { C, FONT, Kit, glow, shade, textPlane, used, withEdges, ease } from "./core.js";

// 原作品（K10）里车辆是车头朝 +z 建模的：放进内层组旋转 90°，外层就是车头朝 +x
function facingX(inner, zFront, zRear) {
  const g = new THREE.Group();
  inner.rotation.y = Math.PI / 2;
  inner.position.x = -(zFront + zRear) / 2;
  g.add(inner);
  return g;
}

function sideLabel(w, h, bg, stripe, text, sub) {
  return textPlane(w, h, (c, cw, ch) => {
    c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
    c.fillStyle = stripe; c.fillRect(0, ch * 0.74, cw, ch * 0.12); c.fillRect(0, ch * 0.9, cw * 0.6, ch * 0.05);
    c.font = `bold ${ch * 0.36}px ${FONT}`; c.textBaseline = "middle"; c.fillText(text, 20, ch * 0.3);
    if (sub) { c.fillStyle = "#334155"; c.font = `${ch * 0.17}px ${FONT}`; c.fillText(sub, 22, ch * 0.6); }
  }, { px: 1024, py: 200 });
}
function plateTex(text, w = 0.5, h = 0.16) {
  return textPlane(w, h, (c, cw, ch) => {
    c.fillStyle = "#facc15"; c.fillRect(0, 0, cw, ch); c.strokeStyle = "#111"; c.lineWidth = 4; c.strokeRect(3, 3, cw - 6, ch - 6);
    c.fillStyle = "#111"; c.font = `bold ${ch * 0.6}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, cw / 2, ch / 2 + 2);
  }, { px: 256, py: 80 });
}

// 双开后门（带锁杆、铰链）+ 施封锁
function rearDoors(g, W, bed, H, zr, color) {
  const doors = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * (W / 2 + 0.02), 0, zr - 0.02);
    const k = new Kit(), dw = W / 2 - 0.02, cx = -s * dw / 2;
    k.box(dw, H - 0.1, 0.05, color, cx, bed + 0.05, -0.03);
    k.box(dw - 0.1, 0.04, 0.02, 0xd5dbe1, cx, bed + 0.8, -0.065); k.box(dw - 0.1, 0.04, 0.02, 0xd5dbe1, cx, bed + 1.9, -0.065);
    for (const f of [0.3, 0.72]) { const x = -s * dw * f; k.box(0.05, H - 0.25, 0.05, 0x9aa3ad, x, bed + 0.12, -0.09); k.box(0.08, 0.06, 0.1, 0x6b7785, x, bed + 0.1, -0.09); k.box(0.08, 0.06, 0.1, 0x6b7785, x, bed + H - 0.2, -0.09); }
    k.box(0.06, 0.38, 0.06, 0x475569, -s * dw * 0.72 + s * 0.12, bed + 1.05, -0.13);
    for (const y of [0.35, 1.35, 2.35]) k.box(0.1, 0.12, 0.08, 0x475569, 0, bed + y, -0.05);
    k.build(piv, { angle: 30 });
    g.add(piv); doors.push({ piv, s });
  }
  const seal = new THREE.Group();
  { const k = new Kit(); k.box(0.09, 0.14, 0.03, 0xdc2626, 0, 0, 0); k.add(new THREE.TorusGeometry(0.06, 0.012, 6, 14), 0xdc2626, 0, -0.07, 0, 0, Math.PI / 2); k.build(seal, { angle: 40 }); }
  seal.position.set(W / 2 - 0.02 - (W / 2 - 0.02) * 0.72 + 0.12, bed + 1.02, zr - 0.2);
  seal.visible = false; g.add(seal);
  return { doors, seal, setDoors: (f) => { for (const d of doors) d.piv.rotation.y = -d.s * 1.5 * Math.PI * ease(f) * 0.985; } };
}
function tailLights(g, W, y, z) {
  const mats = [];
  for (const s of [-1, 1]) {
    const m = glow(0xff2020, 0.9);
    const l = withEdges(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.05), m)); l.position.set(s * (W / 2 - 0.3), y, z); g.add(l); mats.push(m);
    const a = withEdges(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), glow(0xf59e0b, 0.25))); a.position.set(s * (W / 2 - 0.08), y, z); g.add(a);
  }
  return mats;
}

// 厢式货车 / 冷藏车（长约 12 m，厢底高 1.25 m，厢高 2.7 m）
// truck({ text: "快递干线", sub: "", brand: "#1f5f9e", cab: 0xe9edf1, reefer: false, plate: "沪A·12345" })
// userData：setDoors(0~1) 开后门、seal（施封锁，visible 控制）、side（右侧墙，设 visible=false 可看车厢内部）、cargoOrigin（车厢内地板起点）
export function truck({ text = "快递干线", sub = "", brand = "#1f5f9e", cab = 0xe9edf1, reefer = false, plate = "" } = {}) {
  used("truck");
  const inner = new THREE.Group();
  const W = 2.5, bed = 1.25, H = 2.7, z0 = -2.2, z1 = 7.4, L = z1 - z0, zc = (z0 + z1) / 2;
  const body = reefer ? 0xf8fafc : 0xf1f4f7;
  const k = new Kit();
  k.box(0.95, 0.24, 11.9, 0x2b3038, 0, 0.66, 3.7);
  for (const z of [-0.65, 0.65]) for (const s of [-1, 1]) k.wheel(0.5, 0.3, s * 0.97, 0.5, z, false);
  for (const s of [-1, 1]) k.wheel(0.5, 0.3, s * 1.0, 0.5, 8.4, false);
  for (const s of [-1, 1]) { k.box(0.1, 0.5, 2.3, 0x475569, s * 1.2, 0.35, 0); k.box(0.1, 0.18, 4.6, 0xcbd2da, s * 1.18, 0.55, 3.6); }
  k.box(0.5, 0.45, 1.1, 0x94a3b8, -0.95, 0.5, 4.5);
  k.box(0.35, 0.35, 0.9, 0x334155, 0.95, 0.55, 5.4);
  k.box(W, 0.14, L, 0x9aa3ad, 0, bed - 0.14, zc);
  k.box(W - 0.1, 0.02, L - 0.1, 0x7c858f, 0, bed, zc);
  k.box(0.06, H, L, body, -W / 2 + 0.03, bed, zc);
  k.box(W, 0.06, L, body, 0, bed + H - 0.06, zc);
  k.box(W, H, 0.06, body, 0, bed, z1 - 0.03);
  for (const s of [-1, 1]) k.box(0.12, H, 0.14, 0xcbd2da, s * (W / 2 - 0.06), bed, z0 + 0.07);
  k.box(W, 0.18, 0.14, 0xcbd2da, 0, bed + H - 0.18, z0 + 0.07);
  k.box(W + 0.04, 0.1, 0.18, 0x64748b, 0, bed - 0.24, z0 + 0.08);
  k.box(2.3, 0.14, 0.12, 0x334155, 0, 0.45, z0 + 0.2);
  for (const s of [-1, 1]) k.box(0.1, 0.4, 0.1, 0x334155, s * 0.9, 0.5, z0 + 0.2);
  for (let z = z0 + 0.8; z < z1; z += 1.2) k.box(W + 0.02, 0.04, 0.08, 0xdfe5ea, 0, bed + H - 0.02, z);
  if (reefer) {
    k.box(1.9, 1.05, 0.55, 0xe5e7eb, 0, bed + H - 1.25, z1 + 0.3);
    k.box(1.7, 0.85, 0.02, 0x64748b, 0, bed + H - 1.15, z1 + 0.585);
    k.box(0.5, 0.2, 0.03, 0x0f172a, 0.55, bed + H - 0.45, z1 + 0.59);
  }
  const cz0 = z1 + (reefer ? 0.62 : 0.15), cz1 = cz0 + 2.2, ccz = (cz0 + cz1) / 2;
  k.box(2.44, 2.2, 2.2, cab, 0, 0.95, ccz);
  k.box(2.46, 0.3, 2.22, 0x44505c, 0, 0.75, ccz);
  k.box(2.1, 0.95, 0.05, C.glass, 0, 1.95, cz1 + 0.01);
  for (const s of [-1, 1]) { k.box(0.05, 0.75, 1.0, C.glass, s * 1.225, 2.05, ccz + 0.45); k.box(0.05, 1.15, 0.05, 0x1f2937, s * 1.3, 1.9, cz1 + 0.15); k.box(0.1, 0.4, 0.22, 0x1f2937, s * 1.36, 2.5, cz1 + 0.15); k.box(0.22, 0.16, 0.06, 0xfff7d6, s * 0.95, 0.95, cz1 + 0.02); }
  k.box(1.2, 0.35, 0.05, 0x334155, 0, 1.15, cz1 + 0.02);
  k.box(2.46, 0.32, 0.2, 0x334155, 0, 0.55, cz1 + 0.1);
  k.box(0.35, 0.2, 0.25, 0x94a3b8, 0, 3.15, ccz - 0.2);
  k.box(2.3, 0.06, 1.8, cab, 0, 3.15, ccz);
  k.build(inner, { angle: 30 });
  const side = new THREE.Group();
  { const k2 = new Kit(); k2.box(0.06, H, L, body, W / 2 - 0.03, bed, zc); k2.build(side, { angle: 30 }); }
  inner.add(side);
  const stripe = reefer ? "#0e7490" : brand;
  for (const s of [-1, 1]) {
    const p = sideLabel(L - 1.2, 1.4, body === 0xf8fafc ? "#f8fafc" : "#f1f4f7", stripe, text, sub);
    p.position.set(s * (W / 2 + 0.012), bed + 1.55, zc); p.rotation.y = s * Math.PI / 2; (s > 0 ? side : inner).add(p);
    const c = textPlane(2.1, 0.35, (cv, w, h) => { cv.fillStyle = stripe; cv.fillRect(0, 0, w, h); cv.fillStyle = "#fff"; cv.font = `bold ${h * 0.55}px ${FONT}`; cv.textBaseline = "middle"; cv.fillText(reefer ? "冷链专线" : text.slice(0, 6), 16, h / 2); }, { px: 512, py: 86 });
    c.position.set(s * 1.225, 1.45, ccz); c.rotation.y = s * Math.PI / 2; inner.add(c);
  }
  if (plate) { const p = plateTex(plate); p.position.set(0, 0.62, z0 + 0.13); p.rotation.y = Math.PI; inner.add(p); }
  const u = rearDoors(inner, W, bed, H, z0, body);
  const tail = tailLights(inner, W, 0.7, z0 + 0.12);
  const head = [];
  for (const s of [-1, 1]) { const m = glow(0xfff2c0, 0); const h = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.04), m); h.position.set(s * 0.95, 1.04, cz1 + 0.05); inner.add(h); head.push(m); }
  const g = facingX(inner, cz1, z0);
  // 车厢内部坐标（相对外层组）：地板高度 bed，后门在 x = rearX，前墙在 x = frontX
  g.userData = { ...u, side, tail, head, bed, width: W, length: cz1 - z0, rearX: -(cz1 - z0) / 2, frontX: -(cz1 - z0) / 2 + L, setLights: (on) => head.forEach((m) => (m.emissiveIntensity = on ? 1 : 0)) };
  return g;
}

// 牵引车（原点在鞍座中心）
function tractorInner(cab, label) {
  const g = new THREE.Group(), k = new Kit();
  k.box(0.95, 0.26, 6.9, 0x2b3038, 0, 0.62, 1.55);
  k.box(1.25, 0.12, 1.1, 0x1f2328, 0, 0.9, 0); k.box(1.4, 0.06, 1.4, 0x334155, 0, 1.02, 0); k.box(0.35, 0.07, 0.5, 0x0f172a, 0, 1.08, -0.5);
  for (const z of [0.35, -0.95]) for (const s of [-1, 1]) { k.wheel(0.52, 0.28, s * 0.83, 0.52, z, false); k.wheel(0.52, 0.28, s * 1.12, 0.52, z, false); }
  for (const s of [-1, 1]) k.wheel(0.52, 0.3, s * 1.05, 0.52, 3.75, false);
  for (const s of [-1, 1]) { k.box(0.12, 0.08, 2.4, 0x1f2328, s * 1.25, 1.12, -0.3); k.box(0.1, 0.1, 0.9, 0x1f2328, s * 1.28, 1.12, 3.75); }
  for (const s of [-1, 1]) { k.hcyl(0.32, 1.2, 0xcbd2da, s * 0.95, 0.75, 2.05, true, 14); k.box(0.36, 0.08, 0.1, 0x475569, s * 0.95, 1.05, 1.8); }
  k.box(2.46, 2.55, 2.2, cab, 0, 1.1, 3.75);
  k.box(2.48, 0.25, 2.22, 0x1f2937, 0, 0.95, 3.75);
  k.box(2.1, 1.0, 0.05, C.glass, 0, 2.3, 4.86);
  for (const s of [-1, 1]) { k.box(0.05, 0.85, 0.95, C.glass, s * 1.235, 2.35, 4.2); k.box(0.05, 1.2, 0.05, 0x1f2937, s * 1.32, 2.25, 5.0); k.box(0.1, 0.45, 0.24, 0x1f2937, s * 1.38, 2.9, 5.0); k.box(0.26, 0.18, 0.06, 0xfff7d6, s * 0.9, 1.25, 4.87); k.box(0.3, 0.5, 0.07, 0x1f2937, s * 1.0, 0.72, 4.8); }
  k.box(1.6, 0.6, 0.05, 0x334155, 0, 1.45, 4.87);
  for (let y = 1.25; y < 1.7; y += 0.12) k.box(1.5, 0.03, 0.02, 0x94a3b8, 0, y, 4.9);
  k.box(2.5, 0.35, 0.25, 0x334155, 0, 0.65, 4.95);
  k.box(2.3, 0.15, 0.25, 0x1f2937, 0, 3.4, 4.85);
  k.box(2.3, 0.7, 1.8, cab, 0, 3.65, 3.55); k.box(2.2, 0.35, 0.9, cab, 0, 4.35, 3.1);
  for (const s of [-1, 1]) { k.cyl(0.09, 2.6, 0xb8c0c8, s * 1.1, 1.2, 2.55, 10); k.cyl(0.11, 0.25, 0x475569, s * 1.1, 3.8, 2.55, 10); }
  k.box(1.2, 0.8, 0.1, 0x334155, 0, 1.3, 2.52);
  k.build(g, { angle: 30 });
  for (const s of [-1, 1]) { const p = textPlane(1.6, 0.36, (c, w, h) => { c.fillStyle = "#1f2937"; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = `bold ${h * 0.55}px ${FONT}`; c.textBaseline = "middle"; c.fillText(label, 14, h / 2); }, { px: 400, py: 90 }); p.position.set(s * 1.235, 1.7, 3.75); p.rotation.y = s * Math.PI / 2; g.add(p); }
  const beaconM = glow(0xffa000, 0.3);
  const beacon = withEdges(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), beaconM)); beacon.position.set(0, 4.62, 3.1); g.add(beacon);
  return { g, beaconM };
}
// 半挂车厢体（原点在牵引销）
function trailerInner(text, sub, brand, plate) {
  const g = new THREE.Group();
  const W = 2.5, bed = 1.3, H = 2.75, z0 = -12.4, z1 = 1.2, L = z1 - z0, zc = (z0 + z1) / 2, body = 0xf1f4f7;
  const k = new Kit();
  k.box(1.0, 0.3, L - 0.4, 0x2b3038, 0, bed - 0.44, zc - 0.2);
  k.box(1.6, 0.06, 1.6, 0x475569, 0, bed - 0.2, 0.2);
  k.box(W, 0.14, L, 0x9aa3ad, 0, bed - 0.14, zc);
  k.box(0.06, H, L, body, -W / 2 + 0.03, bed, zc); k.box(0.06, H, L, body, W / 2 - 0.03, bed, zc);
  k.box(W, 0.06, L, body, 0, bed + H - 0.06, zc);
  k.box(W, H, 0.06, body, 0, bed, z1 - 0.03);
  for (const s of [-1, 1]) k.box(0.12, H, 0.14, 0xcbd2da, s * (W / 2 - 0.06), bed, z0 + 0.07);
  k.box(W, 0.18, 0.14, 0xcbd2da, 0, bed + H - 0.18, z0 + 0.07);
  for (let z = z0 + 0.8; z < z1; z += 1.2) k.box(W + 0.02, 0.04, 0.08, 0xdfe5ea, 0, bed + H - 0.02, z);
  for (let z = z0 + 0.6; z < z1 - 0.2; z += 1.3) for (const s of [-1, 1]) k.box(0.04, H - 0.2, 0.06, 0xe2e8f0, s * (W / 2 + 0.02), bed + 0.1, z);
  for (const z of [-9.2, -10.5, -11.8]) for (const s of [-1, 1]) { k.wheel(0.5, 0.28, s * 0.8, 0.5, z, false); k.wheel(0.5, 0.28, s * 1.08, 0.5, z, false); }
  for (const s of [-1, 1]) { k.box(0.1, 0.1, 4.0, 0x334155, s * 0.55, 0.75, -10.5); k.box(0.06, 0.55, 5.6, 0xcbd2da, s * (W / 2 - 0.04), 0.5, -5.6); }
  k.box(2.3, 0.14, 0.12, 0x334155, 0, 0.45, z0 + 0.2);
  for (const s of [-1, 1]) k.box(0.16, 0.7, 0.16, 0x1f2937, s * 0.95, 0.55, -1.8);
  k.bar(-0.95, 0.9, -1.8, 0.95, 0.9, -1.8, 0.05, 0x1f2937);
  k.build(g, { angle: 30 });
  const legs = new THREE.Group();
  { const k2 = new Kit(); for (const s of [-1, 1]) { k2.box(0.11, 0.62, 0.11, 0x475569, s * 0.95, 0.06, -1.8); k2.box(0.34, 0.06, 0.34, 0x1f2937, s * 0.95, 0.0, -1.8); } k2.build(legs, { angle: 30 }); }
  g.add(legs);
  for (const s of [-1, 1]) { const p = sideLabel(L - 1.6, 1.45, "#f1f4f7", brand, text, sub); p.position.set(s * (W / 2 + 0.05), bed + 1.55, zc); p.rotation.y = s * Math.PI / 2; g.add(p); }
  if (plate) { const p = plateTex(plate, 0.55, 0.17); p.position.set(0, 0.62, z0 + 0.13); p.rotation.y = Math.PI; g.add(p); }
  const u = rearDoors(g, W, bed, H, z0, body);
  u.tail = tailLights(g, W, 0.7, z0 + 0.12);
  u.legs = legs;
  u.setLegs = (f) => { legs.position.y = (1 - f) * 0.5; }; // 1 = 放下支腿，0 = 收起
  return { g, u, z0 };
}

// 牵引车 + 半挂车（总长约 17 m）：semi({ text: "干线甩挂", cab: 0xe0662b })
// userData：tractor、trailer（两个组，甩挂时可以分开移动：trailer 原点在牵引销）、setDoors、setLegs、seal
export function semi({ text = "干线甩挂", sub = "", brand = "#1f5f9e", cab = 0xe0662b, plate = "", tractorLabel = "甩挂牵引" } = {}) {
  used("semi");
  const inner = new THREE.Group();
  const t = tractorInner(cab, tractorLabel), tr = trailerInner(text, sub, brand, plate);
  inner.add(t.g, tr.g);
  const g = facingX(inner, 5.1, tr.z0);
  g.userData = { ...tr.u, tractor: t.g, trailer: tr.g, beacon: t.beaconM };
  return g;
}
// 单独的牵引车（车头朝 +x，原点在鞍座）
export function tractor({ cab = 0xe0662b, label = "牵引车" } = {}) {
  used("tractor");
  const t = tractorInner(cab, label);
  t.g.rotation.y = Math.PI / 2;
  const g = new THREE.Group(); g.add(t.g); g.userData = { beacon: t.beaconM };
  return g;
}

// 快递面包车 / 城配小货车（长约 5 m）：van({ color: 0xf8fafc, brand: "#1f5f9e", text: "城市配送" })
// userData：setDoor(0~1) 开侧滑门
export function van({ color = 0xf8fafc, brand = "#1f5f9e", text = "城市配送" } = {}) {
  used("van");
  const g = new THREE.Group(), k = new Kit(), W = 1.9;
  k.box(4.9, 0.3, 1.7, 0x2b3038, 0, 0.32, 0);
  for (const x of [-1.6, 1.5]) for (const s of [-1, 1]) { k.wheel(0.36, 0.24, x, 0.36, s * 0.86); k.box(0.9, 0.12, 0.22, 0x3b4656, x, 0.72, s * 0.95); }
  // 车身侧面轮廓（货厢 + 斜前窗 + 车头）挤出成整车车身
  const sh = new THREE.Shape();
  sh.moveTo(-2.4, 0.55); sh.lineTo(2.5, 0.55); sh.lineTo(2.5, 1.2); sh.lineTo(2.3, 1.4); sh.lineTo(1.6, 2.2); sh.lineTo(1.2, 2.25); sh.lineTo(-2.4, 2.25); sh.lineTo(-2.4, 0.55);
  const bodyG = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false }); bodyG.translate(0, 0, -W / 2);
  k.add(bodyG, color);
  k.add(new THREE.BoxGeometry(1.0, 0.03, W - 0.3), C.glass, 1.97, 1.81, 0, 0, 0, Math.atan2(0.8, -0.7));
  for (const s of [-1, 1]) { k.box(0.7, 0.5, 0.03, C.glass, 1.35, 1.48, s * (W / 2 + 0.005)); k.box(0.08, 0.2, 0.25, 0x1f2937, 1.55, 1.45, s * (W / 2 + 0.12)); }
  k.box(0.1, 0.32, 1.7, 0x334155, 2.55, 0.42, 0);
  for (const s of [-1, 1]) k.box(0.05, 0.16, 0.36, 0xfff7d6, 2.56, 0.9, s * 0.65);
  k.box(0.05, 0.5, 0.18, 0xb91c1c, -2.36, 1.3, 0.8); k.box(0.05, 0.5, 0.18, 0xb91c1c, -2.36, 1.3, -0.8);
  k.box(0.04, 1.5, 0.02, 0x64748b, -2.36, 0.65, 0);
  k.box(3.62, 0.08, W + 0.02, shade(color, 0.85), -0.6, 2.25, 0);
  k.build(g, { angle: 30 });
  for (const s of [-1, 1]) {
    const p = textPlane(2.6, 0.7, (c, w, h) => { c.fillStyle = "#" + color.toString(16).padStart(6, "0"); c.fillRect(0, 0, w, h); c.fillStyle = brand; c.fillRect(0, h * 0.78, w, h * 0.12); c.font = `bold ${h * 0.42}px ${FONT}`; c.textBaseline = "middle"; c.fillText(text, 14, h * 0.38); }, { px: 768, py: 200 });
    p.position.set(-0.8, 1.3, s * (W / 2 + 0.012)); if (s < 0) p.rotation.y = Math.PI; g.add(p);
  }
  const door = new THREE.Group();
  { const d = new Kit(); d.box(1.0, 1.55, 0.04, shade(color, 0.96), 0, 0.62, 0); d.box(0.2, 0.04, 0.05, 0x475569, -0.38, 1.25, 0.02); d.build(door, { angle: 30 }); }
  door.position.set(0.6, 0, W / 2 + 0.03); g.add(door);
  g.userData = { door, setDoor: (f) => { door.position.x = 0.6 - 1.05 * ease(f); door.position.z = W / 2 + 0.03 + 0.08 * Math.min(1, f * 4); } };
  return g;
}

// 无人配送车（长约 3.2 m，两侧快递柜门，顶上激光雷达会转）：ulv({ text: "无人配送" })
export function ulv({ text = "无人配送", code = "LC-07" } = {}) {
  used("ulv");
  const g = new THREE.Group(), k = new Kit();
  const WH = 0xf4f6f8, BL = C.blue, DK = 0x273241;
  k.box(2.9, 0.22, 1.08, DK, 0, 0.2, 0);
  for (const x of [-1.02, 1.02]) for (const z of [-0.57, 0.57]) { k.wheel(0.32, 0.22, x, 0.32, z, true); k.box(0.78, 0.12, 0.24, 0x3b4656, x, 0.62, z * 1.02); }
  k.box(3.16, 0.3, 1.2, 0x3b4656, 0, 0.36, 0);
  k.box(2.3, 1.18, 1.24, WH, -0.38, 0.64, 0);
  k.box(0.82, 1.18, 1.24, WH, 1.17, 0.64, 0);
  k.box(0.1, 0.52, 1.12, 0x0f172a, 1.6, 1.08, 0);
  k.box(0.12, 0.08, 1.26, BL, 1.18, 0.82, 0);
  k.box(2.32, 0.1, 1.26, BL, -0.38, 0.66, 0);
  k.box(3.24, 0.07, 1.28, 0xe2e8f0, -0.02, 1.82, 0);
  for (const s of [-1, 1]) {
    for (const [ci, x] of [-1.18, -0.42, 0.34].entries()) for (const [ri, y] of [0.78, 1.3].entries()) {
      k.box(0.7, 0.48, 0.02, 0xe9edf2, x, y, s * 0.63);
      k.box(0.04, 0.14, 0.03, 0x64748b, x + 0.27, y + 0.18, s * 0.645);
      k.box(0.12, 0.05, 0.025, ci === 1 && ri === 1 ? 0x22c55e : 0x94a3b8, x - 0.24, y + 0.38, s * 0.642);
    }
    k.box(0.12, 0.12, 0.08, 0x111827, 1.42, 1.55, s * 0.64);
  }
  k.box(0.03, 1.05, 1.0, 0xe9edf2, -1.545, 0.72, 0);
  k.box(0.42, 0.08, 0.6, 0x334155, 1.2, 1.92, 0);
  k.box(0.14, 0.1, 0.34, 0x111827, 1.42, 1.93, 0);
  k.cyl(0.095, 0.035, 0xf8fafc, -0.62, 1.95, 0, 20);
  k.build(g, { angle: 28 });
  const lidar = new THREE.Group(); lidar.position.set(1.2, 2.0, 0); g.add(lidar);
  { const kk = new Kit(); kk.cyl(0.125, 0.16, 0x1f2937, 0, 0, 0, 20); kk.cyl(0.13, 0.04, 0x64748b, 0, 0.06, 0, 20); kk.box(0.05, 0.06, 0.02, 0x22d3ee, 0.12, 0.05, 0); kk.build(lidar, { angle: 30 }); }
  const led = glow(0x22d3ee, 1.2);
  for (const s of [-1, 1]) { const e = withEdges(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.3), led)); e.position.set(1.66, 1.14, s * 0.27); g.add(e); }
  for (const s of [-1, 1]) {
    const p = textPlane(1.6, 0.26, (c, w, h) => { c.fillStyle = "#f4f6f8"; c.fillRect(0, 0, w, h); c.fillStyle = "#1f5f9e"; c.font = `bold ${h * 0.62}px ${FONT}`; c.textBaseline = "middle"; c.fillText(text, 8, h * 0.52); c.fillStyle = "#64748b"; c.textAlign = "right"; c.fillText(code, w - 10, h * 0.52); }, { px: 1024, py: 160 });
    p.position.set(-0.35, 0.47, s * 0.625); if (s < 0) p.rotation.y = Math.PI; g.add(p);
  }
  g.userData = { lidar, led, tick: (dt) => { lidar.rotation.y += dt * 6; } };
  return g;
}

// 平衡重叉车（长约 3 m）：forklift({ color: 0xf2b705 })
// userData：setLift(高度 m) 升降货叉；fork（货叉组，把托盘 add 到它上面就跟着走，托盘放在 fork 的 (1.7, 0.05, 0) 附近）
export function forklift({ color = C.yellow } = {}) {
  used("forklift");
  const g = new THREE.Group(), k = new Kit();
  k.box(2.1, 0.7, 1.2, color, -0.2, 0.3, 0);
  k.box(0.5, 0.9, 1.2, 0x3f4650, -1.35, 0.3, 0);
  k.box(0.8, 0.15, 0.9, 0x1f2937, -0.4, 1.0, 0);
  k.box(0.55, 0.12, 0.5, 0x111827, -0.55, 1.12, 0); k.box(0.1, 0.55, 0.5, 0x111827, -0.8, 1.15, 0);
  k.add(new THREE.TorusGeometry(0.16, 0.025, 6, 16), 0x111827, 0.25, 1.55, 0, Math.PI / 2, 0.6, 0);
  k.cyl(0.03, 0.5, 0x374151, 0.3, 1.05, 0, 6);
  for (const sz of [1, -1]) { k.box(0.07, 1.4, 0.07, 0x1f2937, 0.35, 1.0, sz * 0.52); k.box(0.07, 1.4, 0.07, 0x1f2937, -1.05, 1.0, sz * 0.52); }
  k.box(1.5, 0.06, 1.12, 0x1f2937, -0.35, 2.4, 0);
  for (let x = -0.95; x < 0.3; x += 0.2) k.box(0.03, 0.03, 1.05, 0x374151, x, 2.46, 0);
  k.wheel(0.36, 0.3, 0.55, 0.36, 0.5); k.wheel(0.36, 0.3, 0.55, 0.36, -0.5);
  k.wheel(0.28, 0.24, -1.05, 0.28, 0.48); k.wheel(0.28, 0.24, -1.05, 0.28, -0.48);
  for (const sz of [1, -1]) k.box(0.1, 2.4, 0.12, 0x374151, 0.95, 0.1, sz * 0.36);
  k.box(0.1, 0.1, 0.84, 0x374151, 0.95, 2.4, 0);
  k.cyl(0.05, 1.6, 0x9ca3af, 0.88, 0.4, 0, 8);
  k.box(0.5, 0.06, 0.05, 0x1f2937, -0.1, 0.75, 0.61); k.box(0.5, 0.06, 0.05, 0x1f2937, -0.1, 0.75, -0.61);
  k.build(g, { angle: 30 });
  const fork = new THREE.Group(), ck = new Kit();
  ck.box(0.08, 0.7, 1.0, 0x1f2937, 1.05, 0, 0);
  for (let y = 0.15; y < 0.7; y += 0.18) ck.box(0.06, 0.03, 1.0, 0x4b5563, 1.1, y, 0);
  for (const sz of [0.3, -0.3]) { ck.box(1.2, 0.05, 0.12, 0x6b7280, 1.7, 0, sz); ck.box(0.06, 0.5, 0.12, 0x6b7280, 1.1, 0, sz); }
  ck.build(fork, { angle: 30 });
  fork.position.y = 0.12; g.add(fork);
  const beacon = glow(0x3b82f6, 1);
  const b = withEdges(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), beacon)); b.position.set(-1.0, 2.55, 0.4); g.add(b);
  g.userData = { fork, beacon, setLift: (h) => { fork.position.y = 0.12 + Math.max(0, Math.min(2.6, h)); }, tick: (dt, t) => { beacon.emissiveIntensity = Math.sin(t * 6) > 0 ? 1.4 : 0.1; } };
  return g;
}

