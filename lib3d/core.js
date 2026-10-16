// tp3d 基础：零件收集器（很多小零件合并成一个顶点色网格 + 描边线）、贴图、材质、动画小工具
// 画风来自平台已有的 3D 作品：顶点色合并网格 + EdgesGeometry 深色描边，亮面/暗面两层配色叠加细节。
// 单位：米，y 轴向上。所有部件的原点在地面中心，车辆车头朝 +x。
import * as THREE from "three";
import { mergeGeometries } from "three/addons";

export const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","WenQuanYi Zen Hei",sans-serif';
export const LINE = new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.72 });
export const LINE_SOFT = new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.32 });
export const VMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });

// 常用配色（亮面 / 暗面）
export const C = {
  white: 0xf4f6f8, gray: 0x94a3b8, dark: 0x334155, black: 0x1f2328, steel: 0xb8c0c8,
  blue: 0x1f5f9e, sky: 0x3aa0d8, teal: 0x0e7490, green: 0x16a34a, red: 0xd83a3a,
  orange: 0xf97316, yellow: 0xf2b705, glass: 0x2c4a63, carton: 0xc8a270, wood: 0xb07a3e,
};

// 统计：给平台的 html_check 判断“画面是否太空”
export const STATS = { parts: 0, labels: 0, zones: 0, ambient: 0, kinds: new Set() };
export const used = (kind) => STATS.kinds.add(kind);

// 可复现的随机数（同一个场景每次打开都一样）
let seed = 11;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// 颜色变亮/变暗：shade(0x1f5f9e, 0.7) 得到暗面色
export function shade(hex, f) { _c.set(hex); const h = {}; _c.getHSL(h); _c.setHSL(h.h, h.s, Math.min(1, Math.max(0, h.l * f))); return _c.getHex(); }

// 零件收集器：k.box(...) / k.cyl(...) 加很多小零件，最后 k.build(parent) 合并成一个网格（快，学校电脑也带得动）
export class Kit {
  constructor() { this.parts = []; }
  add(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    _e.set(rx, ry, rz, "YXZ"); _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    g.clearGroups();
    this.parts.push(g);
    STATS.parts++;
    return this;
  }
  // 长方体：y 是底面高度（放在地上写 0）
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry); }
  // 两点之间的方杆（栏杆、斜撑、钢丝）
  bar(ax, ay, az, bx, by, bz, t, color) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 0.001;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    return this.add(new THREE.BoxGeometry(t, L, t), color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, e.y, e.x, e.z);
  }
  // 竖放圆柱（r2 = 顶部半径，做锥形）
  cyl(r, h, color, x = 0, y = 0, z = 0, seg = 12, r2) { return this.add(new THREE.CylinderGeometry(r2 ?? r, r, h, seg), color, x, y + h / 2, z); }
  // 横放圆柱：沿 x（默认）或沿 z
  hcyl(r, len, color, x, y, z, alongZ = false, seg = 12) { return this.add(new THREE.CylinderGeometry(r, r, len, seg), color, x, y, z, 0, alongZ ? Math.PI / 2 : 0, alongZ ? 0 : Math.PI / 2); }
  // 车轮：轮胎 + 轮毂，默认轮轴沿 z
  wheel(r, w, x, y, z, alongZ = true) { this.hcyl(r, w, 0x22262b, x, y, z, alongZ, 16); this.hcyl(r * 0.55, w + 0.04, 0xb8c0c8, x, y, z, alongZ, 12); return this; }
  sphere(r, color, x = 0, y = 0, z = 0, seg = 10) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), color, x, y, z); }
  build(parent, { edges = true, angle = 30, shadow = true, line = LINE, material = VMAT } = {}) {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow; m.receiveShadow = true;
    if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, angle), line));
    if (parent) parent.add(m);
    return m;
  }
}

// 一次性小部件：kit((k) => { k.box(...) }) 返回一个 Group
export function kit(fn, opts) { const g = new THREE.Group(), k = new Kit(); fn(k); k.build(g, opts); return g; }

// ---------- 材质、描边 ----------
const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o }); matCache.set(key, m); }
  return m;
}
export function withEdges(mesh, line = LINE, angle = 30) { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle), line)); return mesh; }
// 单个带描边的网格：part(new THREE.BoxGeometry(1,1,1), 0xff0000)
export function part(geo, color, o = {}) { const m = withEdges(new THREE.Mesh(geo, mat(color, o))); m.castShadow = true; m.receiveShadow = true; STATS.parts++; return m; }
// 发光材质（指示灯、车灯），intensity 可改，用于闪烁
export function glow(color, intensity = 1.2) { return new THREE.MeshStandardMaterial({ color: shade(color, 0.4), emissive: color, emissiveIntensity: intensity }); }

// ---------- 贴图与文字牌 ----------
export function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function textPlane(w, h, draw, o = {}) {
  const t = canvasTex(o.px ?? Math.round(256 * Math.max(1, w / h)), o.py ?? 256, draw);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, transparent: !!o.transparent, side: o.side ?? THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2 }));
}
// 标牌：sign("出港打板区", "BUILD-UP AREA", { w: 10, h: 2.4, bg: "#0e7490" })，正面朝 +z
export function sign(text, sub = "", { w = 4, h = 1, bg = "#1f5f9e", fg = "#fff", post = 0 } = {}) {
  const g = new THREE.Group();
  const p = textPlane(w, h, (c, cw, ch) => {
    c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
    c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 6; c.strokeRect(8, 8, cw - 16, ch - 16);
    c.fillStyle = fg; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `bold ${Math.round(ch * (sub ? 0.42 : 0.56))}px ${FONT}`;
    c.fillText(text, cw / 2, sub ? ch * 0.4 : ch / 2, cw - 30);
    if (sub) { c.font = `${Math.round(ch * 0.2)}px ${FONT}`; c.fillText(sub, cw / 2, ch * 0.78, cw - 30); }
  });
  p.position.set(0, post + h / 2, 0.03); g.add(p);
  const k = new Kit();
  k.box(w + 0.08, h + 0.08, 0.05, 0x334155, 0, post - 0.04, 0);
  if (post > 0) for (const s of [-1, 1]) k.box(0.1, post, 0.1, 0x64748b, s * (w / 2 - 0.2), 0, -0.04);
  k.build(g, { angle: 30 });
  used("sign");
  return g;
}

// ---------- 动画小工具 ----------
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
// seg(p, 0.2, 0.6)：p 在 0.2~0.6 之间时从 0 走到 1（把一步拆成几个小动作）
export const seg = (p, a, b) => ease((p - a) / (b - a));
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// 点位插值：mix([0,0,0], [5,2,0], t) 返回 Vector3
export const mix = (a, b, t) => V(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));

// 路线：path([[x,z], [x,z], ...]) 或 [[x,y,z], ...]；path.place(obj, u) 把物体放到 u(0~1) 处并朝向前进方向（车头 +x）
export function path(points, { smooth = false, y = 0 } = {}) {
  const pts = points.map((p) => (p.isVector3 ? p.clone() : p.length === 2 ? V(p[0], y, p[1]) : V(p[0], p[1], p[2])));
  let curve;
  if (smooth && pts.length > 2) curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  else { curve = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1])); }
  const length = curve.getLength(), _p = V(), _t = V();
  return {
    length, curve,
    at(u) { return curve.getPointAt(clamp(u)); },
    place(obj, u, face = true) {
      u = clamp(u);
      curve.getPointAt(u, _p); obj.position.copy(_p);
      if (face) { curve.getTangentAt(Math.min(u, 0.9999), _t); if (Math.hypot(_t.x, _t.z) > 1e-4) obj.rotation.y = Math.atan2(-_t.z, _t.x); }
      if (obj.userData.walk) obj.userData.walk(u * length * 3.2);
      return obj;
    },
  };
}
