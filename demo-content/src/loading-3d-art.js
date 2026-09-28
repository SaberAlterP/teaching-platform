// 装车配载 3D 模拟 · 美术资源：精细建模、清晰轮廓线、简洁的材质层次
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// ---------- 轮廓线 ----------
export const lineMats = new Set();
export function lineMat(color, width, opacity = 1) {
  const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity });
  m.resolution.set(innerWidth, innerHeight);
  lineMats.add(m);
  return m;
}
const INK_COLOR = 0x162033;
export const INK = { main: lineMat(INK_COLOR, 1.5), fine: lineMat(0x3a4556, 0.8, 0.6) };
const hullMat = new THREE.MeshBasicMaterial({ color: INK_COLOR, side: THREE.BackSide });

// 统一材质：表面往后偏一点，让轮廓线干净地压在上面
export function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...o });
}

// 把许多零件合并成少量网格（每种材质一个）+ 一组轮廓线，渲染开销小
export class Builder {
  constructor() {
    this.parts = new Map();
    this.lines = new Map();
    this.extra = [];
  }
  _xf(geo, x, y, z, o) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(o.sx || 1, o.sy || 1, o.sz || 1)));
    return g;
  }
  // o.line：轮廓线材质（false 不画）；o.angle：折角大于多少度画线；o.hull：用外扩背面画外轮廓（适合圆柱、圆角体）
  add(geo, mat, x = 0, y = 0, z = 0, o = {}) {
    const g = this._xf(geo, x, y, z, o);
    this._push(this.parts, mat, g);
    const lm = o.line === undefined ? INK.main : o.line;
    if (lm) this.edge(new THREE.EdgesGeometry(g, o.angle ?? 30), lm);
    if (o.hull) this.hull(geo, x, y, z, o, o.hull === true ? 0.012 : o.hull);
    return this;
  }
  hull(geo, x, y, z, o = {}, pad = 0.012) {
    geo.computeBoundingBox();
    const s = geo.boundingBox.getSize(new THREE.Vector3());
    const k = (v) => (v > 1e-6 ? (v + 2 * pad) / v : 1);
    const g = this._xf(geo, 0, 0, 0, {});
    g.applyMatrix4(new THREE.Matrix4().makeScale(k(s.x), k(s.y), k(s.z)));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(o.sx || 1, o.sy || 1, o.sz || 1)));
    this._push(this.parts, hullMat, g);
  }
  edge(edgesGeo, lm = INK.main) {
    this._push(this.lines, lm, edgesGeo.attributes.position.array);
  }
  // 方盒的轮廓（圆角纸箱用直角盒的棱线，位置几乎重合）
  boxEdge(l, h, w, x, y, z, lm = INK.main) {
    const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(l, h, w));
    e.translate(x, y, z);
    this.edge(e, lm);
  }
  mesh(obj) {
    this.extra.push(obj);
    return obj;
  }
  _push(map, k, v) {
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(v);
  }
  build() {
    const g = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = !mat.transparent && mat !== hullMat;
      m.receiveShadow = mat !== hullMat;
      g.add(m);
    }
    for (const o of this.extra) {
      o.castShadow = !o.material.transparent;
      o.receiveShadow = true;
      g.add(o);
    }
    for (const [lm, arrs] of this.lines) {
      const buf = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
      let off = 0;
      for (const a of arrs) { buf.set(a, off); off += a.length; }
      g.add(new LineSegments2(new LineSegmentsGeometry().setPositions(buf), lm));
    }
    return g;
  }
}

// ---------- 通用材质 ----------
export const M = {
  wood: std(0xd3a468, { roughness: 0.85 }),
  woodDark: std(0xae7c44, { roughness: 0.9 }),
  strap: std(0x39414e, { roughness: 0.35, metalness: 0.6 }),
  pet: std(0x2f6fed, { roughness: 0.45 }),
  film: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false }),
  drum: std(0x2459d6, { roughness: 0.35, metalness: 0.45 }),
  drumTop: std(0x1c449f, { roughness: 0.4, metalness: 0.5 }),
  chrome: std(0xdfe5ec, { roughness: 0.22, metalness: 0.85 }),
  darkGlass: std(0x1b2433, { roughness: 0.08, metalness: 0.4 }),
  rubber: std(0x1f232a, { roughness: 0.9 }),
  plastic: std(0x4b5563, { roughness: 0.5 }),
  tape: std(0xb68e55, { roughness: 0.45 }),
  corner: std(0xece3cf, { roughness: 0.9 }),
  steelGrey: std(0x6b7584, { roughness: 0.45, metalness: 0.5 }),
};

// ---------- 货物模型 ----------
export const PH = 0.14; // 托盘高度

function pallet(B, l, w, y0) {
  const zs = [-w / 2 + 0.05, 0, w / 2 - 0.05];
  const f = { line: INK.fine };
  for (const z of zs) B.add(new THREE.BoxGeometry(l, 0.022, 0.1), M.wood, 0, y0 + 0.011, z, f);
  for (const x of [-l / 2 + 0.07, 0, l / 2 - 0.07]) for (const z of zs) B.add(new THREE.BoxGeometry(0.14, 0.078, 0.1), M.woodDark, x, y0 + 0.061, z, f);
  for (const z of zs) B.add(new THREE.BoxGeometry(l, 0.018, 0.1), M.wood, 0, y0 + 0.109, z, f);
  const n = 7;
  for (let i = 0; i < n; i++) B.add(new THREE.BoxGeometry(0.1, 0.022, w), M.wood, -l / 2 + 0.05 + (i * (l - 0.1)) / (n - 1), y0 + 0.129, 0, f);
}
function strap(B, x, bw, bh, yb, mat = M.strap, wd = 0.032, t = 0.006) {
  B.add(new THREE.BoxGeometry(wd, t, bw + 2 * t), mat, x, yb + bh + t / 2, 0, { line: false });
  for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(wd, bh, t), mat, x, yb + bh / 2, s * (bw / 2 + t / 2), { line: false });
}
function cornerGuards(B, l, w, bh, yb) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      B.add(new THREE.BoxGeometry(0.07, bh, 0.01), M.corner, sx * (l / 2 - 0.035), yb + bh / 2, sz * (w / 2 + 0.005), { line: INK.fine });
      B.add(new THREE.BoxGeometry(0.01, bh, 0.07), M.corner, sx * (l / 2 + 0.005), yb + bh / 2, sz * (w / 2 - 0.035), { line: INK.fine });
    }
}
function labelBox(B, mats, l, h, w, x, y, z, r = 0.012) {
  const m = B.mesh(new THREE.Mesh(new RoundedBoxGeometry(l, h, w, 2, r), mats));
  m.position.set(x, y, z);
  B.boxEdge(l, h, w, x, y, z);
  return m;
}
function tapeTop(B, l, h, y) {
  B.add(new THREE.BoxGeometry(l + 0.004, 0.003, 0.06), M.tape, 0, y + h / 2 + 0.0015, 0, { line: false });
  for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.003, Math.min(0.12, h * 0.3), 0.06), M.tape, s * (l / 2 + 0.0015), y + h / 2 - Math.min(0.12, h * 0.3) / 2, 0, { line: false });
}

// labelMats(l, h, w) 返回贴好标签的六面材质；faceTex(wm, hm) 返回单面标签贴图
export function cargoModel(key, t, labelMats, faceTex) {
  const [l, w, h] = t.dims;
  const B = new Builder();
  const y0 = -h / 2;
  if (t.pallet) {
    pallet(B, l, w, y0);
    const bh = h - PH, yb = y0 + PH, cy = yb + bh / 2;
    if (key === "oil") {
      const r = Math.min(l, w) / 4 - 0.006, dh = bh - 0.01;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const x = (sx * l) / 4, z = (sz * w) / 4;
          B.add(new THREE.CylinderGeometry(r, r, dh, 36), M.drum, x, yb + dh / 2, z, { hull: 0.01 });
          for (const k of [1 / 3, 2 / 3]) B.add(new THREE.TorusGeometry(r + 0.004, 0.011, 8, 48), M.drum, x, yb + dh * k, z, { rx: Math.PI / 2, line: false });
          B.add(new THREE.CylinderGeometry(r - 0.025, r - 0.025, 0.012, 36), M.drumTop, x, yb + dh + 0.006, z, { line: INK.fine });
          B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), M.chrome, x + r * 0.45, yb + dh + 0.012, z - r * 0.3, { line: INK.fine });
        }
      // 桶身上的标签牌
      const pm = new THREE.MeshStandardMaterial({ map: faceTex(0.5, 0.42), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
      for (const s of [-1, 1]) {
        const p = B.mesh(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.29), pm));
        p.position.set((s * l) / 4, yb + dh * 0.5, s * (w / 4 + r + 0.003));
        if (s < 0) p.rotation.y = Math.PI;
      }
      strap(B, 0, w + 0.004, dh * 0.1, yb + dh * 0.55, M.pet, 0.03, 0.004);
    } else {
      labelBox(B, labelMats(l, bh, w), l, bh, w, 0, cy, 0, 0.01);
      if (key === "steel") { strap(B, -l / 4, w, bh, yb); strap(B, l / 4, w, bh, yb); }
      if (key === "tile") { cornerGuards(B, l, w, bh, yb); strap(B, -l / 4, w, bh, yb, M.pet); strap(B, l / 4, w, bh, yb, M.pet); }
      if (key === "drink" || key === "foam") B.add(new RoundedBoxGeometry(l + 0.016, bh + 0.008, w + 0.016, 2, 0.02), M.film, 0, cy + 0.004, 0, { line: false });
    }
    return B.build();
  }
  if (key === "quilt") {
    const geo = new RoundedBoxGeometry(l, h, w, 4, 0.1);
    B.mesh(new THREE.Mesh(geo, labelMats(l, h, w)));
    B.hull(geo, 0, 0, 0, {}, 0.01);
    for (const x of [-l / 4, l / 4]) {
      B.add(new THREE.BoxGeometry(0.04, 0.012, w - 0.1), M.pet, x, h / 2 - 0.004, 0, { line: false });
      for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.04, h - 0.12, 0.012), M.pet, x, 0, s * (w / 2 - 0.004), { line: false });
    }
    return B.build();
  }
  if (key === "fridge" || key === "washer") {
    const mats = labelMats(l, h, w).slice();
    mats[0] = std(t.color, { roughness: 0.3, metalness: 0.15 }); // 正面（+x）不贴标签
    labelBox(B, mats, l, h, w, 0, 0, 0, 0.03);
    const fx = l / 2;
    if (key === "fridge") {
      B.add(new THREE.BoxGeometry(0.006, 0.012, w - 0.06), M.plastic, fx + 0.002, -h / 2 + 1.12, 0, { line: false });
      B.add(new THREE.BoxGeometry(0.01, 0.08, w - 0.04), M.plastic, fx, -h / 2 + 0.05, 0, { line: INK.fine });
      for (const [yc, hl] of [[-h / 2 + 1.12 + 0.36, 0.42], [-h / 2 + 1.12 - 0.3, 0.32]]) {
        B.add(new THREE.BoxGeometry(0.028, hl, 0.028), M.chrome, fx + 0.045, yc, w / 2 - 0.09, { line: INK.fine });
        for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.04, 0.02, 0.02), M.chrome, fx + 0.02, yc + (s * hl) / 2.4, w / 2 - 0.09, { line: false });
      }
    } else {
      B.add(new THREE.BoxGeometry(0.008, 0.13, w - 0.06), M.plastic, fx + 0.002, h / 2 - 0.09, 0, { line: INK.fine });
      B.add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 20), M.chrome, fx + 0.015, h / 2 - 0.09, w / 2 - 0.13, { rz: Math.PI / 2, line: INK.fine });
      B.add(new THREE.BoxGeometry(0.004, 0.035, 0.18), M.darkGlass, fx + 0.007, h / 2 - 0.09, -0.08, { line: false });
      B.add(new THREE.TorusGeometry(0.19, 0.028, 12, 48), M.chrome, fx + 0.01, -0.06, 0, { ry: Math.PI / 2, line: false, hull: 0.006 });
      B.add(new THREE.CylinderGeometry(0.165, 0.165, 0.012, 40), M.darkGlass, fx + 0.008, -0.06, 0, { rz: Math.PI / 2, line: INK.fine });
    }
    return B.build();
  }
  // 普通纸箱：玻璃器皿、日用百货、板式家具
  labelBox(B, labelMats(l, h, w), l, h, w, 0, 0, 0, 0.012);
  tapeTop(B, l, h, 0);
  if (key === "furn") cornerGuards(B, l, w, h, -h / 2);
  return B.build();
}

// ---------- 箱壁 ----------
// 瓦楞壁板：内侧为平面（y=0），外侧起梯形波纹，拉伸方向为高度
export function corrugated(len, height, pitch = 0.28, depth = 0.035, thick = 0.012) {
  const n = Math.max(1, Math.round(len / pitch)), p = len / n;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(len, 0);
  s.lineTo(len, -thick);
  for (let i = n - 1; i >= 0; i--) {
    const x = i * p;
    s.lineTo(x + p * 0.85, -thick);
    s.lineTo(x + p * 0.7, -thick - depth);
    s.lineTo(x + p * 0.3, -thick - depth);
    s.lineTo(x + p * 0.15, -thick);
    s.lineTo(x, -thick);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); // 波纹朝 +z 外侧，高度朝 +y
  return g;
}

export function makeTex(w, h, draw) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
