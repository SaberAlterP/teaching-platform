// 驿站 3D 场景：建筑、五个作业区、货架与在库包裹、设备、室外校园
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import * as T from "./tex.js";
import { Grid } from "./nav.js";
import { CARRIERS, STOCK, SHELF_SLOT, SHELF_RULES, ZONES } from "./data.js";

const PI = Math.PI;
export const ROOM = { x0: -12, x1: 12, z0: -8, z1: 8, h: 3.8 };
// 货架：编号 → 中心位置（面朝 +z）
export const SHELVES = { 1: [0, -7.5], 2: [4.4, -7.5], 3: [0, -4.6], 4: [4.4, -4.6] };
export const LV = [0.1, 0.55, 1.0, 1.45]; // 各层隔板中心高度
export const BIG = { x0: 7.7, z: -7.0, n: 5, w: 0.72, y: 0.15 }; // 5 号大件区（托盘）

// 库位 → 位置（返回包裹底面中心所在的前沿点）
export function slotPos(s, l, k) {
  if (s === 5) return { x: BIG.x0 + (k - 0.5) * BIG.w, y: BIG.y, z: BIG.z + 0.55, front: BIG.z + 0.55 };
  const [cx, cz] = SHELVES[s];
  return { x: cx - 1.8 + 0.3 + (k - 1) * 0.6, y: LV[l - 1] + 0.0125, z: cz + 0.2, front: cz + 0.2 };
}
// 站在货架前看某个库位的机位
export function slotPose(s, l, k) {
  const p = slotPos(s, l, k);
  if (s === 5) return { stand: [p.x, p.front + 1.3], eye: [p.x, 1.55, p.front + 1.7], look: [p.x, 0.4, p.front - 0.2] };
  const ly = p.y + 0.14;
  return { stand: [p.x, p.front + 1.15], eye: [p.x, Math.max(1.05, Math.min(1.6, ly + 0.55)), p.front + 1.05], look: [p.x, ly, p.front - 0.1] };
}

export function buildWorld(scene, renderer) {
  const W = { anim: [], pick: [], blockers: [], dev: {}, grid: new Grid(-17, -10, 17, 21, 0.2) };
  const grid = W.grid;
  const batch = new Map();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

  // ---------- 材质 ----------
  const std = (color, rough = 0.7, metal = 0, ex = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...ex });
  const fl = T.floorTex();
  const M = {
    floor: std("#ffffff", 1, 0, { map: fl.map, roughnessMap: fl.rough }),
    wall: std("#ffffff", 0.92, 0, { map: T.wallTex() }),
    clad: std("#ffffff", 0.55, 0.35, { map: T.cladTex() }),
    ceil: std("#ffffff", 0.95, 0, { map: T.ceilTex(), emissive: "#4a4844" }),
    shelf: std("#c3c8cd", 0.42, 0.55),
    shelfDark: std("#7d858e", 0.5, 0.5),
    steel: std("#d2d6da", 0.28, 0.9),
    alu: std("#2c3034", 0.4, 0.6),
    black: std("#1d1f22", 0.6, 0.1),
    plastic: std("#f2f2ef", 0.45),
    gray: std("#8e959c", 0.6, 0.2),
    teal: std("#0f7f86", 0.55, 0.1),
    tealDark: std("#0b5f66", 0.55, 0.1),
    quartz: std("#ebe8e2", 0.3, 0),
    wood: std("#b8895a", 0.75),
    woodDark: std("#8a6440", 0.8),
    yellow: std("#f0c22b", 0.6),
    red: std("#d23b32", 0.55),
    rubber: std("#26282b", 0.85),
    glass: new THREE.MeshStandardMaterial({ color: "#d9ecf2", roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false }),
    glassDark: new THREE.MeshStandardMaterial({ color: "#1c2a33", roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55 }),
    led: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff8ea", emissiveIntensity: 1.6, roughness: 0.4 }),
    paver: std("#ffffff", 0.9, 0, { map: T.paverTex() }),
    grass: std("#ffffff", 1, 0, { map: T.grassTex() }),
    asphalt: std("#ffffff", 0.95, 0, { map: T.asphaltTex() }),
    curb: std("#b9b5ad", 0.85),
    foliage: std("#ffffff", 0.85, 0, { vertexColors: true }),
    bark: std("#ffffff", 0.9, 0, { map: T.barkTex() }),
    mesh: null,
  };
  M.floor.map.repeat.set(20, 13.33); M.floor.map.wrapS = M.floor.map.wrapT = THREE.RepeatWrapping;
  M.floor.roughnessMap.repeat.set(20, 13.33); M.floor.roughnessMap.wrapS = M.floor.roughnessMap.wrapT = THREE.RepeatWrapping;
  M.wall.map.wrapS = M.wall.map.wrapT = THREE.RepeatWrapping; M.wall.map.repeat.set(6, 1.5);
  M.ceil.map.wrapS = M.ceil.map.wrapT = THREE.RepeatWrapping; M.ceil.map.repeat.set(20, 13.33);
  M.clad.map.wrapS = M.clad.map.wrapT = THREE.RepeatWrapping;
  M.paver.map.wrapS = M.paver.map.wrapT = THREE.RepeatWrapping;
  M.grass.map.wrapS = M.grass.map.wrapT = THREE.RepeatWrapping;
  M.asphalt.map.wrapS = M.asphalt.map.wrapT = THREE.RepeatWrapping;
  W.M = M;

  // ---------- 工具 ----------
  function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE); tmpP.set(x, y, z); tmpS.set(sx, sy, sz);
    return tmpM.clone().compose(tmpP, tmpQ, tmpS);
  }
  // 静态网格：按材质合并，减少绘制次数
  function put(geo, mat, x, y, z, ry = 0, o = {}) {
    const g = geo.clone().applyMatrix4(o.m || mtx(x, y, z, o.rx || 0, ry, o.rz || 0));
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const k = mat.uuid + (g.index ? "i" : "n") + (o.cast === false ? 0 : 1);
    if (!batch.has(k)) batch.set(k, { mat, cast: o.cast !== false, list: [] });
    batch.get(k).list.push(g);
  }
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const RB = (w, h, d, r = 0.02, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);
  const box = (w, h, d, mat, x, y, z, ry = 0, o) => put(B(w, h, d), mat, x, y, z, ry, o);
  function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  // 双面标牌：背面再贴一张转过来的，文字从两边看都是正的
  function twoSided(m) { const b = new THREE.Mesh(m.geometry, m.material); b.rotation.y = PI; b.castShadow = false; m.add(b); return m; }
  function pickable(obj, name, extra = {}) { obj.userData.pick = { name, ...extra }; W.pick.push(obj); return obj; }

  // 接触阴影贴片（室内没有实时阴影的地方用它压暗物体底部，看起来更扎实）
  const blobTex = (() => {
    const c = T.cv(128, 128), g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(0.55, "rgba(0,0,0,.28)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return T.tex(c, { srgb: false });
  })();
  const blobs = [];
  function blob(x, z, sx, sz, op = 0.8, y = 0.004) {
    const g = new THREE.PlaneGeometry(sx, sz).rotateX(-PI / 2).translate(x, y, z);
    const col = new Float32Array(g.attributes.position.count * 3).fill(op);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    blobs.push(g);
  }
  W.blobTex = blobTex;

  // ============ 地面 ============
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-PI / 2), M.paver);
  M.paver.map.repeat.set(160 / 2.4, 160 / 2.4);
  ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 16).rotateX(-PI / 2), M.floor);
  floor.receiveShadow = true; scene.add(floor);
  W.floor = floor; W.ground = ground;
  // 门前台阶
  box(3.4, 0.04, 1.2, M.curb, 0, 0.0, 8.7, 0, { cast: false });
  // 道路与绿地
  const road = new THREE.Mesh(new THREE.PlaneGeometry(160, 7).rotateX(-PI / 2), M.asphalt);
  M.asphalt.map.repeat.set(40, 2); road.position.set(0, -0.012, 19.5); road.receiveShadow = true; scene.add(road);
  for (let x = -70; x < 70; x += 6) box(3, 0.005, 0.15, std("#e8e4d8", 0.8), x, -0.008, 19.5, 0, { cast: false });
  box(160, 0.14, 0.25, M.curb, 0, 0.05, 15.9, 0, { cast: false }); box(160, 0.14, 0.25, M.curb, 0, 0.05, 23.1, 0, { cast: false });
  for (const [x, z, w, d] of [[-10, 13.2, 9, 3.6], [11, 13.2, 7, 3.6], [-19, 0, 10, 14], [19, 0, 10, 14], [0, -14.5, 30, 6]]) {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), M.grass);
    gm.position.set(x, -0.006, z); gm.receiveShadow = true; scene.add(gm);
    M.grass.map.repeat.set(4, 4);
    box(w + 0.2, 0.12, 0.12, M.curb, x, 0.04, z - d / 2, 0, { cast: false }); box(w + 0.2, 0.12, 0.12, M.curb, x, 0.04, z + d / 2, 0, { cast: false });
    box(0.12, 0.12, d, M.curb, x - w / 2, 0.04, z, 0, { cast: false }); box(0.12, 0.12, d, M.curb, x + w / 2, 0.04, z, 0, { cast: false });
    grid.block(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0.05);
  }

  // ============ 建筑外壳 ============
  const H = ROOM.h;
  function wall(x0, z0, x1, z1, y0 = 0, y1 = H + 0.6, innerSide) {
    const w = Math.abs(x1 - x0) || 0.25, d = Math.abs(z1 - z0) || 0.25;
    const g = B(w, y1 - y0, d);
    const mats = [M.clad, M.clad, M.clad, M.clad, M.clad, M.clad];
    // BoxGeometry 面顺序：+x -x +y -y +z -z
    const idx = { "+x": 0, "-x": 1, "+z": 4, "-z": 5 }[innerSide];
    if (idx != null) { mats[idx] = M.wall; }
    const m = new THREE.Mesh(g, mats);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
    W.blockers.push(m);
    // 内墙贴图按尺寸平铺
    return m;
  }
  wall(-12.25, -8.25, -12, 8.25, 0, H + 0.6, "+x");
  wall(12, -8.25, 12.25, 8.25, 0, H + 0.6, "-x");
  wall(-12.25, -8.25, -10, -8, 0, H + 0.6, "+z");
  wall(-7, -8.25, 12.25, -8, 0, H + 0.6, "+z");
  wall(-10, -8.25, -7, -8, 3.0, H + 0.6, "+z");
  wall(-12.25, 8, -10, 8.25, 0, H + 0.6, "-z");
  wall(10, 8, 12.25, 8.25, 0, H + 0.6, "-z");
  wall(-10, 8, 10, 8.25, 3.0, H + 0.6, "-z");
  grid.block(-12.4, -8.4, -11.95, 8.4, 0.2); grid.block(11.95, -8.4, 12.4, 8.4, 0.2);
  grid.block(-12.4, -8.4, 12.4, -7.95, 0.2);
  grid.block(-12.4, 7.95, -1.25, 8.3, 0.2); grid.block(1.25, 7.95, 12.4, 8.3, 0.2);
  // 屋面与女儿墙
  // 屋面板底面比吊顶高 5cm，两个面不能重合，否则会闪烁（z-fighting）
  box(24.6, 0.3, 16.6, M.clad, 0, H + 0.2, 0);
  box(24.6, 0.5, 0.15, M.clad, 0, H + 0.6, 8.25); box(24.6, 0.5, 0.15, M.clad, 0, H + 0.6, -8.25);
  // 吊顶
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 16).rotateX(PI / 2), M.ceil);
  ceil.position.y = H; scene.add(ceil);
  // 平板灯
  for (let x = -10.5; x <= 10.5; x += 3) for (let z = -6; z <= 6; z += 3) box(0.6, 0.02, 1.2, M.led, x, H - 0.012, z, 0, { cast: false });
  // 墙裙、腰线（品牌色）
  for (const [x, z, w, d] of [[-11.99, 0, 0.02, 16], [11.99, 0, 0.02, 16]]) {
    box(w, 0.14, d, M.teal, x, 2.5, z, 0, { cast: false });
  }
  box(2, 0.12, 0.02, M.gray, -11, 0.06, -7.99, 0, { cast: false });
  box(19, 0.12, 0.02, M.gray, 2.5, 0.06, -7.99, 0, { cast: false });
  box(19, 0.14, 0.02, M.teal, 2.5, 2.5, -7.99, 0, { cast: false });
  box(2, 0.14, 0.02, M.teal, -11, 2.5, -7.99, 0, { cast: false });

  // ---------- 正立面：玻璃幕墙 + 感应门 ----------
  const mull = (x, y, z, w, h, d) => box(w, h, d, M.alu, x, y, z);
  for (const [a, b] of [[-10, -1.2], [1.2, 10]]) {
    const n = Math.round((b - a) / 2.2);
    for (let i = 0; i <= n; i++) mull(a + ((b - a) * i) / n, 1.5, 8.1, 0.07, 3.0, 0.12);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 2.9), M.glass);
    gl.position.set((a + b) / 2, 1.55, 8.1); scene.add(gl);
    mull((a + b) / 2, 0.06, 8.1, b - a, 0.12, 0.14); mull((a + b) / 2, 3.0, 8.1, b - a, 0.08, 0.14);
    mull((a + b) / 2, 1.05, 8.1, b - a, 0.05, 0.1);
  }
  mull(0, 2.75, 8.1, 2.5, 0.5, 0.2);
  const doorL = new THREE.Group(), doorR = new THREE.Group();
  for (const [d, s] of [[doorL, -1], [doorR, 1]]) {
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.42), M.glass); gp.position.y = 1.25; d.add(gp);
    for (const [x, y, w, h] of [[0, 0.04, 1.2, 0.08], [0, 2.47, 1.2, 0.06], [-0.58, 1.25, 0.05, 2.5], [0.58, 1.25, 0.05, 2.5]]) mesh(B(w, h, 0.05), M.alu, x, y, 0, d);
    mesh(B(0.03, 0.6, 0.05), M.steel, s * -0.5, 1.1, 0.06, d);
    d.position.set(s * 0.6, 0, 8.1); scene.add(d);
  }
  W.doors = { L: doorL, R: doorR, open: 0 };
  // 门头招牌
  const signC = T.cv(1024, 128), sg = signC.getContext("2d");
  sg.fillStyle = "#0f7f86"; sg.fillRect(0, 0, 1024, 128);
  sg.fillStyle = "#fff"; sg.font = T.font(70, "bold"); sg.textBaseline = "middle"; sg.fillText("校园驿站", 40, 66);
  sg.font = T.font(40); sg.fillText("快递收寄 · 取件 · 寄件服务中心", 400, 66);
  W.signMat = new THREE.MeshStandardMaterial({ map: T.tex(signC), emissive: "#ffffff", emissiveMap: null, emissiveIntensity: 0, roughness: 0.4 });
  W.signMat.emissiveMap = W.signMat.map;
  const sign = mesh(new THREE.PlaneGeometry(7.2, 0.9), W.signMat, 0, 3.62, 8.27); sign.castShadow = false;
  // 雨棚
  box(4, 0.08, 1.4, M.alu, 0, 3.08, 8.85);

  // ---------- 后墙卷帘门 ----------
  const roller = new THREE.Group();
  const rp = mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: T.rollerTex(), roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }), 0, -1.5, 0, roller);
  roller.position.set(-8.5, 3.0, -8.1); scene.add(roller);
  box(3.3, 0.35, 0.35, M.gray, -8.5, 3.18, -8.15);
  box(0.1, 3.0, 0.18, M.alu, -10.02, 1.5, -8.1); box(0.1, 3.0, 0.18, M.alu, -6.98, 1.5, -8.1);
  W.roller = { g: roller, panel: rp, open: 0, target: 0 };
  // 卷帘门外的硬化场地 + 配送车
  box(9, 0.02, 7, std("#9a978f", 0.9), -8.5, -0.005, -12, 0, { cast: false });
  W.van = buildVan();
  W.van.g.position.set(-8.5, 0, -12.2);
  scene.add(W.van.g);

  // ============ 内部陈设 ============
  // ---------- A 入库作业区 ----------
  function workbench(cx, cz, len, dep, ry = 0, hgt = 0.86, topMat = M.steel) {
    const g = new THREE.Group();
    mesh(B(len, 0.04, dep), topMat, 0, hgt - 0.02, 0, g);
    mesh(B(len - 0.1, 0.02, dep - 0.1), M.shelf, 0, 0.22, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(B(0.04, hgt - 0.04, 0.04), M.shelf, sx * (len / 2 - 0.05), (hgt - 0.04) / 2, sz * (dep / 2 - 0.05), g);
    g.position.set(cx, 0, cz); g.rotation.y = ry; scene.add(g);
    blob(cx, cz, (ry ? dep : len) + 0.3, (ry ? len : dep) + 0.3, 0.6);
    grid.box(cx, cz, ry ? dep : len, ry ? len : dep);
    return g;
  }
  workbench(-8.5, -5.2, 2.4, 0.9);
  W.aTableY = 0.86;
  // PDA 充电座 + PDA
  box(0.14, 0.05, 0.1, M.black, -7.55, 0.885, -5.48);
  W.dev.pda = makePDA();
  W.dev.pda.g.position.set(-7.55, 0.98, -5.47); W.dev.pda.g.rotation.x = -0.35;
  scene.add(W.dev.pda.g);
  pickable(W.dev.pda.g, "PDA（巴枪）", { dev: "pda" });
  // 入库台旁：异常件周转筐
  W.excCrate = crate(-10.3, -4.45, "#e5a50a", "异常件");
  // 待上架笼车
  W.cageCart = cageCart(-4.3, -3.5);
  // 平板推车（来件）
  W.trolley = trolley();
  W.trolley.position.set(-8.5, 0, -9.4); scene.add(W.trolley);
  // 入库作业规范海报
  poster(-11.97, 1.75, -5.2, PI / 2, "入库作业规范", ["#① 到件交接", "核对件数，签收交接单", "#② 逐件扫码", "枪头距条码 10～20 cm", "#③ 外观验收", "破损/水湿/变形 → 挑出", "#④ 面单检查", "模糊/条码不可读 → 重扫或挑出", "#⑤ 批次确认", "入库数 + 异常数 = 到件数"], "#2f6fed");

  // ---------- B 货架区 ----------
  for (const [s, [cx, cz]] of Object.entries(SHELVES)) shelfUnit(+s, cx, cz);
  // 5 号大件区：托盘 + 地面黄线
  for (let i = 0; i < 2; i++) pallet(BIG.x0 + 0.9 + i * 1.8, BIG.z + 0.05);
  floorLine(7.55, -7.85, 11.55, -6.15, "#f0c22b");
  standSign(11.2, -5.9, "5", "大件区", "#15803d");
  grid.block(7.6, -7.9, 11.5, -6.25, 0.15);
  poster(-4.2, 1.7, -7.97, 0, "上架规则", SHELF_RULES.map((r, i) => (i < 5 ? "#" : "") + r), "#15803d", 0.9, 1.3);
  // 货架区角落：梯凳、清洁车
  box(0.45, 0.6, 0.4, M.teal, 10.9, 0.3, -3.3);
  blob(10.9, -3.3, 0.7, 0.6);
  grid.box(10.9, -3.3, 0.5, 0.45);

  // ---------- E 问题件暂存区 ----------
  floorLine(-11.95, -2.4, -8.6, 1.6, "#dc2626", true);
  W.cage = problemCage(-11.35, -1.3);
  workbench(-11.4, 0.75, 1.3, 0.75, PI / 2, 0.76, M.quartz);
  W.dev.laptop = laptop(-11.45, 0.76, 1.1);
  W.phoneCam = mesh(RB(0.075, 0.008, 0.155, 0.004), M.black, -11.2, 0.765, 0.78);
  W.phoneCam.rotation.y = 0.3;
  mesh(B(0.21, 0.02, 0.29), std("#2a4d8f", 0.7), -11.6, 0.77, 0.72).rotation.y = -0.1; // 台账本
  poster(-11.97, 1.85, 0.6, PI / 2, "问题件处理流程", ["#识别 → 分类", "面单模糊 / 地址不详 / 破损 / 水湿 / 无头件 / 错分件", "#留证 → 登记", "拍照、称重，当日登记台账", "#联系 → 处置", "联系收件人/寄件人/快递公司", "#上报 → 闭环", "24 小时内跟进，结果写回台账"], "#dc2626");

  // ---------- D 寄件处理区 ----------
  workbench(-11.45, 4.6, 2.6, 0.8, PI / 2, 0.86, std("#d9cbb4", 0.7));
  W.dev.scale = makeScale(); W.dev.scale.g.position.set(-11.45, 0.86, 3.75); W.dev.scale.g.rotation.y = PI / 2; scene.add(W.dev.scale.g);
  pickable(W.dev.scale.g, "电子秤", { dev: "scale" });
  W.dev.printer = makePrinter(); W.dev.printer.g.position.set(-11.55, 0.86, 5.55); W.dev.printer.g.rotation.y = PI / 2; scene.add(W.dev.printer.g);
  pickable(W.dev.printer.g, "面单打印机", { dev: "printer" });
  W.dev.sealer = makeTapeGun(); W.dev.sealer.position.set(-11.3, 0.86, 4.85); W.dev.sealer.rotation.y = 0.6; scene.add(W.dev.sealer);
  pickable(W.dev.sealer, "封箱器 / 打包台", { dev: "sealer" });
  // 包材架
  { const g = new THREE.Group(); scene.add(g); g.position.set(-11.55, 0, 7.15);
    for (const y of [0.05, 0.6, 1.15, 1.7]) mesh(B(0.7, 0.025, 1.2), M.shelf, 0, y, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(B(0.035, 1.75, 0.035), M.shelf, sx * 0.33, 0.875, sz * 0.58, g);
    for (let i = 0; i < 7; i++) mesh(B(0.6, 0.012, 0.9), std("#c4955f", 0.85), 0, 0.08 + i * 0.014, 0, g); // 平放的纸箱
    const roll = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.9, 20).rotateX(PI / 2), new THREE.MeshStandardMaterial({ color: "#e8f0f2", roughness: 0.25, transparent: true, opacity: 0.85 }), 0, 0.8, 0, g);
    roll.castShadow = true;
    for (let i = 0; i < 3; i++) mesh(B(0.3 + i * 0.05, 0.22 + i * 0.04, 0.3), M.wood.clone(), 0, 1.3 + 0.0 * i, -0.35 + i * 0.36, g).material.color.set("#c99a62");
    grid.box(-11.55, 7.15, 0.7, 1.2); blob(-11.55, 7.15, 1, 1.5);
  }
  // 寄件柜台
  serviceCounter(-8.4, 4.6, 3.0, PI / 2, "寄件服务", "#7c3aed");
  // 待揽收筐
  W.sendCage = crate(-9.9, 7.35, "#2f6fed", "待揽收");
  poster(-11.97, 1.95, 4.6, PI / 2, "收寄验视 · 禁寄物品（节选）", ["#必须当面验视、实名登记", "#禁止寄递", "枪支弹药、管制刀具", "易燃易爆：打火机、烟花、汽油、酒精", "有毒、腐蚀性、放射性物品", "毒品、违禁出版物", "#限制寄递", "锂电池、液体（按规定包装与数量）", "#计费（本站示例）", "首重 1 kg 10 元，续重 3 元/kg", "体积重 = 长×宽×高(cm)÷6000"], "#7c3aed", 1.0, 1.45);

  // ---------- C 出库服务台 ----------
  serviceCounter(8.6, 4.0, 3.6, -PI / 2, "出库服务台", "#d97706");
  W.dev.monitor = makeMonitor(); W.dev.monitor.g.position.set(8.55, 1.07, 3.2); W.dev.monitor.g.rotation.y = PI / 2 - 0.5; scene.add(W.dev.monitor.g);
  pickable(W.dev.monitor.g, "监控与查询系统", { dev: "monitor" });
  // 柜台上的扫码枪和凭条打印机
  box(0.16, 0.1, 0.2, M.black, 8.7, 1.12, 2.55);
  W.chair = officeChair(10.4, 4.9);
  W.dev.kiosk = makeKiosk(); W.dev.kiosk.g.position.set(6.8, 0, 7.35); W.dev.kiosk.g.rotation.y = PI; scene.add(W.dev.kiosk.g);
  grid.box(6.8, 7.35, 0.6, 0.5); blob(6.8, 7.35, 0.9, 0.8);
  pickable(W.dev.kiosk.g, "自动出库终端", { dev: "kiosk" });
  // 墙上监控屏
  { const s = T.screen(512, 288, (g, w, h) => {
      g.fillStyle = "#0b0f14"; g.fillRect(0, 0, w, h);
      const r = T.rng(4);
      for (let i = 0; i < 4; i++) {
        const x = (i % 2) * w / 2 + 3, y = Math.floor(i / 2) * h / 2 + 3, cw = w / 2 - 6, ch = h / 2 - 6;
        const gr = g.createLinearGradient(x, y, x, y + ch); gr.addColorStop(0, "#3b4651"); gr.addColorStop(1, "#1d242b");
        g.fillStyle = gr; g.fillRect(x, y, cw, ch);
        for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(200,210,220,${0.1 + r() * 0.2})`; g.fillRect(x + r() * cw, y + ch * 0.4 + r() * ch * 0.5, 6 + r() * 30, 4 + r() * 20); }
        g.fillStyle = "#e6f0ff"; g.font = T.font(14); g.fillText(["CAM1 入库区", "CAM2 货架区", "CAM3 出库台", "CAM4 门口"][i], x + 6, y + 16);
        g.fillStyle = "#ff4d4d"; g.beginPath(); g.arc(x + cw - 12, y + 12, 4, 0, 7); g.fill();
      }
    });
    const tv = mesh(B(1.0, 0.58, 0.05), M.black, 11.95, 2.75, 4.0); tv.rotation.y = -PI / 2;
    const sc = mesh(new THREE.PlaneGeometry(0.94, 0.53), new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false }), 11.92, 2.75, 4.0); sc.rotation.y = -PI / 2;
    pickable(tv, "监控与查询系统", { dev: "monitor" });
  }
  poster(11.97, 1.75, 6.6, -PI / 2, "取件与代取须知", ["#取件", "出示取件码，核对手机尾号/姓名", "当面检查外包装后再离开", "#代取", "须提供收件人姓名、手机尾号", "驿站登记代取人姓名与联系方式", "#未收到取件码？", "到服务台凭手机号查询"], "#d97706");
  // 球形监控摄像头
  for (const [x, z] of [[-11.5, -7.5], [11.5, -7.5], [-11.5, 7.5], [11.5, 7.5], [0, -2]]) {
    const d = mesh(new THREE.SphereGeometry(0.08, 16, 8, 0, PI * 2, PI / 2, PI / 2), M.glassDark, x, H, z);
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), M.plastic, x, H - 0.012, z);
    pickable(d, "监控与查询系统", { dev: "monitor" });
  }

  // ---------- 细节道具：灭火器、安全出口灯、空调、饮水机、墙裙 ----------
  for (const [x, z] of [[-11.75, -2.9], [11.75, -1.2], [-6.9, 7.75], [9.6, 7.75]]) {
    put(new THREE.CylinderGeometry(0.075, 0.075, 0.48, 16), std("#c81e1e", 0.35, 0.1), x, 0.26, z);
    put(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 10), M.black, x, 0.54, z);
    put(B(0.22, 0.02, 0.22), std("#8a1010", 0.5), x, 0.01, z, 0, { cast: false });
    blob(x, z, 0.35, 0.35, 0.8);
  }
  { const c = T.cv(256, 96), g = c.getContext("2d"); g.fillStyle = "#13a05a"; g.fillRect(0, 0, 256, 96); g.fillStyle = "#fff"; g.font = T.font(40, "bold"); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("安全出口", 150, 40); g.font = T.font(20, "bold"); g.fillText("EXIT  →", 150, 76); g.fillRect(20, 20, 40, 56);
    const em = new THREE.MeshStandardMaterial({ map: T.tex(c), emissive: "#ffffff", emissiveIntensity: 0.6, roughness: 0.4 }); em.emissiveMap = em.map;
    for (const [x, z, ry] of [[0, 7.85, PI], [-8.5, -7.85, 0]]) { const e = mesh(new THREE.PlaneGeometry(0.36, 0.135), em, x, ry ? 3.45 : 3.3, z); e.rotation.y = ry; e.castShadow = false; }
  }
  for (const [x, z, ry] of [[-11.82, -1.0, PI / 2], [11.82, -5.6, -PI / 2], [11.82, 1.2, -PI / 2]]) {
    const g = new THREE.Group(); g.position.set(x, 3.05, z); g.rotation.y = ry; scene.add(g);
    mesh(RB(0.95, 0.3, 0.22, 0.04), M.plastic, 0, 0, 0, g);
    mesh(B(0.85, 0.02, 0.05), std("#d5d7d9", 0.5), 0, -0.12, 0.1, g);
  }
  { // 饮水机
    const g = new THREE.Group(); g.position.set(-5.4, 0, 7.55); scene.add(g);
    mesh(RB(0.32, 1.0, 0.32, 0.02), M.plastic, 0, 0.5, 0, g);
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 20), new THREE.MeshStandardMaterial({ color: "#9fd3f0", roughness: 0.1, transparent: true, opacity: 0.6 }), 0, 1.22, 0, g);
    mesh(B(0.12, 0.08, 0.04), std("#2f6fed", 0.5), 0, 0.82, 0.17, g);
    blob(-5.4, 7.55, 0.5, 0.5); grid.box(-5.4, 7.55, 0.32, 0.32, 0.15);
  }
  // 浅灰色墙裙（1.1 m 高的护墙板，耐磨耐脏）
  const wainscot = std("#d9dcdf", 0.6);
  box(0.02, 1.1, 16, wainscot, -11.985, 0.55, 0, 0, { cast: false });
  box(0.02, 1.1, 16, wainscot, 11.985, 0.55, 0, 0, { cast: false });
  box(19, 1.1, 0.02, wainscot, 2.5, 0.55, -7.985, 0, { cast: false });
  box(2, 1.1, 0.02, wainscot, -11, 0.55, -7.985, 0, { cast: false });
  for (const [x, z, w, d] of [[-11.97, 0, 0.03, 16], [11.97, 0, 0.03, 16], [2.5, -7.97, 19, 0.03], [-11, -7.97, 2, 0.03]]) box(w, 0.03, d, M.gray, x, 1.11, z, 0, { cast: false });

  // ---------- 大厅 ----------
  // 等候长椅
  bench(-3.6, 6.9); bench(3.4, 6.9);
  // 绿植
  for (const [x, z] of [[-6.3, 7.4], [10.9, 7.4], [-2.2, -0.6], [-11.4, 2.0]]) plant(x, z);
  // 立牌
  standSign(-1.8, 6.2, "i", "取件请出示取件码", "#0f7f86");
  // 墙钟
  { const c = T.cv(256, 256), g = c.getContext("2d");
    g.fillStyle = "#fff"; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.lineWidth = 10; g.strokeStyle = "#2b2f33"; g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; g.fillStyle = "#222"; g.fillRect(128 + Math.sin(a) * 100 - 3, 128 - Math.cos(a) * 100 - 10, 6, 20); }
    W.clockCanvas = c;
    const cm = new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.3 });
    const clk = mesh(new THREE.CircleGeometry(0.22, 32), cm, 2.5, 3.1, -7.97);
    W.clockHands = [];
    for (const [len, w] of [[0.12, 0.014], [0.18, 0.009]]) { const hnd = mesh(B(w, len, 0.004), M.black, 0, 0, 0); hnd.geometry.translate(0, len / 2, 0); hnd.position.set(2.5, 3.1, -7.96); W.clockHands.push(hnd); }
    clk.castShadow = false;
  }
  // 吊牌：五个作业区
  for (const [k, z] of Object.entries(ZONES)) {
    const [x0, z0, x1, z1] = z.rect;
    const pos = { A: [-8.5, -3.6], B: [3.0, -2.9], C: [7.2, 2.6], D: [-8.0, 2.6], E: [-9.6, -1.6] }[k];
    const ry = { A: 0, B: 0, C: 0, D: 0, E: PI / 2 }[k];
    const tx = T.signTex(z.name, z.color, z.duty.slice(0, 14));
    const sm = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5 });
    const sgn = twoSided(mesh(new THREE.PlaneGeometry(1.6, 0.4), sm, pos[0], 2.9, pos[1])); sgn.rotation.y = ry; sgn.castShadow = false;
    for (const s of [-0.7, 0.7]) box(0.008, 0.7, 0.008, M.steel, pos[0] + (ry ? 0 : s), 3.45, pos[1] + (ry ? s : 0), 0, { cast: false });
    if (k !== "B" && k !== "E") floorLine(x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05, z.color);
  }
  // 地面导向箭头：入口 → 出库台 / 寄件区
  arrows([[0, 7], [3.5, 5.4], [6.6, 4.4]], "#d97706");
  arrows([[0, 7], [-3.5, 5.4], [-6.9, 4.6]], "#7c3aed");

  // ============ 室外 ============
  // 智能快递柜（门前右侧，带雨棚）
  W.dev.locker = makeLocker(); W.dev.locker.g.position.set(5.5, 0, 12.3); W.dev.locker.g.rotation.y = PI; scene.add(W.dev.locker.g);
  pickable(W.dev.locker.screenMesh, "智能快递柜", { dev: "locker" });
  grid.block(3.1, 12.0, 7.9, 12.65, 0.2);
  box(5.4, 0.08, 1.4, M.alu, 5.5, 2.45, 11.9);
  for (const x of [3.0, 8.0]) box(0.08, 2.45, 0.08, M.alu, x, 1.22, 11.35);
  blob(5.5, 12.25, 5.2, 1.0, 0.7);
  // 树
  const trees = [[-7, 10.6], [-13.5, 11.2], [-15.5, 4], [-15.6, -4], [14.2, 11.4], [15.5, 3], [15.6, -5], [-4.5, 13.8], [10.5, 14.0], [-18, 13], [19, 12.5], [-2, -13], [6, -13.5], [-14, -13]];
  buildTrees(trees);
  // 远处楼房
  building(-30, 34, 26, 14, 18, "5 栋", 7);
  building(8, 38, 30, 14, 22, "6 栋", 8);
  building(40, 30, 16, 12, 15, "实训楼", 3);
  building(-42, -2, 14, 34, 20, "7 栋", 12);
  building(42, -6, 14, 30, 16, "行政楼", 13);
  building(-6, -34, 40, 14, 18, "9 栋", 21);
  // 自行车与车棚
  for (let i = 0; i < 5; i++) bike(-11.3 + i * 0.75, 11.4, i);
  grid.block(-11.8, 10.6, -7.9, 12.1, 0.1);
  // 路灯
  W.lamps = [];
  for (const x of [-14, -2, 10, 22]) W.lamps.push(lamp(x, 15.4));
  // 垃圾桶
  for (const [x, c] of [[10.6, "#2f7d4f"], [11.1, "#3b6fb6"]]) { box(0.42, 0.85, 0.42, std(c, 0.6), x, 0.425, 8.75); box(0.44, 0.04, 0.44, std("#2b2f33", 0.5), x, 0.86, 8.75); blob(x, 8.75, 0.6, 0.6); grid.box(x, 8.75, 0.42, 0.42, 0.15); }

  // ---------- 合并静态网格 ----------
  for (const { mat, cast, list } of batch.values()) {
    const geo = mergeGeometries(list, false);
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    list.forEach((g) => g.dispose());
  }
  if (blobs.length) {
    const bg = mergeGeometries(blobs, false);
    const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ alphaMap: blobTex, color: "#000", transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.75 }));
    bm.renderOrder = 1; scene.add(bm);
  }

  // 在库包裹（合并批次）
  W.fillers = buildFillers();
  scene.add(W.fillers.group);
  W.pick.push(...W.fillers.meshes);

  // ============ 灯光与天空 ============
  const sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  su.cloudCoverage.value = 0.35; su.cloudDensity.value = 0.35;
  const hemi = new THREE.HemisphereLight("#eef4ff", "#9c9486", 0.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff3df", 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0, 2); scene.add(sun, sun.target);
  // 室内灯（不投影，配合接触阴影）
  const inLights = [];
  for (const [x, z] of [[-7, -4], [3, -4.5], [-7, 4], [4, 4]]) {
    // 向下照的灯：不会像点光源那样穿墙照亮室外地面
    const l = new THREE.SpotLight("#fff6ea", 11, 14, 1.12, 0.85, 1.2); l.position.set(x, 3.6, z); l.target.position.set(x, 0, z);
    scene.add(l, l.target); inLights.push(l);
  }
  // 门头夜灯
  const doorLight = new THREE.PointLight("#ffe2b0", 0, 10, 1.5); doorLight.position.set(0, 3.0, 9.6); scene.add(doorLight);
  W.lights = { sky, hemi, sun, inLights, doorLight };
  W.setTime = (h) => setTime(h);
  setTime(8);

  function setTime(h) {
    const day = THREE.MathUtils.clamp((h - 6) / 12.2, 0, 1); // 6:00 日出，18:12 日落
    const el = Math.sin(day * PI) * 1.05 - 0.08 + (h > 18.2 ? -(h - 18.2) * 0.15 : 0);
    const az = PI * day; // 东(+x) → 南(+z，门面朝向) → 西
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.9 + 0.35).normalize();
    su.sunPosition.value.copy(dir);
    sun.position.copy(sun.target.position).addScaledVector(dir, 60);
    const up = THREE.MathUtils.clamp(el / 0.35, 0, 1);
    sun.intensity = 2.8 * up;
    sun.color.setHSL(0.09, 0.6 + (1 - up) * 0.35, 0.92 - (1 - up) * 0.25);
    hemi.intensity = 0.2 + 0.5 * THREE.MathUtils.clamp(el / 0.25 + 0.4, 0, 1);
    hemi.color.setHSL(0.6, 0.4, 0.55 + 0.35 * up);
    scene.environmentIntensity = 0.22 + 0.2 * up;
    const night = el < 0.02;
    sky.visible = !night;
    scene.background = night ? new THREE.Color("#0b1424") : null;
    if (scene.fog) scene.fog.color.set(night ? "#0b1424" : "#cdd8e3");
    if (night) { hemi.intensity = 0.12; scene.environmentIntensity = 0.14; }
    W.signMat.emissiveIntensity = night ? 1.0 : 0;
    doorLight.intensity = night ? 2.5 : 0;
    W.lamps.forEach((l) => { l.mat.emissiveIntensity = night ? 2 : 0; l.light.intensity = night ? 3.5 : 0; });
    renderer.toneMappingExposure = night ? 0.85 : 1.0;
    W.hour = h;
    // 墙钟
    const mm = (h % 12) * 60;
    W.clockHands[0].rotation.z = -(mm / 720) * PI * 2;
    W.clockHands[1].rotation.z = -((h * 60) % 60) / 60 * PI * 2;
  }

  W.anim.push((dt, t) => { su.time.value = t; });

  // ===================== 组件 =====================
  function poster(x, y, z, ry, title, lines, color, w = 0.8, h = 1.12) {
    const t = T.posterTex(title, lines, color, 512, Math.round(512 * h / w));
    const p = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), x, y, z);
    p.rotation.y = ry; p.castShadow = false;
    // 海报框
    const fr = mesh(B(w + 0.04, h + 0.04, 0.012), M.alu, x - Math.sin(ry) * 0.008, y, z - Math.cos(ry) * 0.008); fr.rotation.y = ry; fr.castShadow = false;
    return p;
  }
  function floorLine(x0, z0, x1, z1, color, hatch = false) {
    const m = std(color, 0.6);
    const w = 0.06;
    box(x1 - x0, 0.004, w, m, (x0 + x1) / 2, 0.003, z0, 0, { cast: false });
    box(x1 - x0, 0.004, w, m, (x0 + x1) / 2, 0.003, z1, 0, { cast: false });
    box(w, 0.004, z1 - z0, m, x0, 0.003, (z0 + z1) / 2, 0, { cast: false });
    box(w, 0.004, z1 - z0, m, x1, 0.003, (z0 + z1) / 2, 0, { cast: false });
    if (hatch) for (let x = x0 + 0.3; x < x1; x += 0.35) box(0.05, 0.004, 0.25, M.black, x, 0.0035, z1 - 0.15, 0.6, { cast: false });
  }
  function arrows(pts, color) {
    const c = T.cv(128, 128), g = c.getContext("2d");
    g.fillStyle = color; g.beginPath(); g.moveTo(64, 8); g.lineTo(120, 64); g.lineTo(84, 64); g.lineTo(84, 120); g.lineTo(44, 120); g.lineTo(44, 64); g.lineTo(8, 64); g.closePath(); g.fill();
    const m = new THREE.MeshStandardMaterial({ map: T.tex(c), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], d = Math.hypot(bx - ax, bz - az), n = Math.floor(d / 0.9);
      const ang = Math.atan2(bx - ax, bz - az);
      for (let k = 1; k <= n; k++) {
        const a = mesh(new THREE.PlaneGeometry(0.42, 0.42).rotateX(-PI / 2), m, ax + (bx - ax) * k / (n + 0.5), 0.005, az + (bz - az) * k / (n + 0.5));
        a.rotation.y = ang + PI; a.castShadow = false;
      }
    }
  }
  function standSign(x, z, letter, text, color) {
    const t = T.signTex(letter + " " + text, color, "", 512, 128);
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 20), M.alu, 0, 0.015, 0, g);
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 8), M.steel, 0, 0.65, 0, g);
    const p = twoSided(mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), 0, 1.3, 0, g));
    p.castShadow = false;
    grid.box(x, z, 0.3, 0.3, 0.15);
  }
  function shelfUnit(s, cx, cz) {
    const L = 3.6, D = 0.45, Hs = 2.0;
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
      box(0.04, Hs, 0.04, M.shelf, cx + sx * (L / 2 - 0.02), Hs / 2, cz + sz * (D / 2 - 0.02));
      // 立柱孔位
      box(0.012, Hs - 0.1, 0.002, M.shelfDark, cx + sx * (L / 2 - 0.02), Hs / 2, cz + sz * (D / 2 - 0.0), 0, { cast: false });
    }
    for (const y of [...LV, 1.9]) {
      box(L, 0.022, D, M.shelf, cx, y, cz);
      box(L, 0.05, 0.015, M.shelfDark, cx, y - 0.005, cz + D / 2);
    }
    // 背面斜拉杆
    for (const sx of [-1, 1]) {
      const len = Math.hypot(L / 2, Hs - 0.2), ang = Math.atan2(Hs - 0.2, L / 2);
      box(len, 0.012, 0.006, M.shelfDark, cx + sx * L / 4, Hs / 2, cz - D / 2 + 0.01, 0, { rz: sx * ang });
    }
    // 库位标签条（每层一条）
    for (let l = 1; l <= 4; l++) {
      const c = T.cv(1024, 32), g = c.getContext("2d");
      g.fillStyle = "#1d4ed8"; g.fillRect(0, 0, 1024, 32);
      for (let k = 1; k <= 6; k++) {
        const x = (k - 1) * (1024 / 6);
        g.fillStyle = "#fff"; g.fillRect(x + 6, 3, 1024 / 6 - 12, 26);
        g.fillStyle = "#0b1f4d"; g.font = T.font(21, "bold"); g.textBaseline = "middle"; g.fillText(`${s}-${l}  第${k}格`, x + 16, 17);
      }
      const lm = new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.5 });
      const strip = mesh(new THREE.PlaneGeometry(L - 0.04, 0.04), lm, cx, LV[l - 1] - 0.005, cz + D / 2 + 0.009);
      strip.castShadow = false;
      if (s === 1 && l === 2) pickable(strip, "货架与库位标签", { dev: "shelf" });
    }
    // 架号牌
    const c = T.cv(256, 160), g = c.getContext("2d");
    g.fillStyle = "#15803d"; g.fillRect(0, 0, 256, 160); g.fillStyle = "#fff"; g.font = T.font(110, "bold"); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(s), 128, 70);
    g.font = T.font(28); g.fillText(["", "宿舍1～4栋", "宿舍5～8栋", "宿舍9～12栋", "教职工"][s], 128, 138);
    const nm = new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.5 });
    const plate = twoSided(mesh(new THREE.PlaneGeometry(0.5, 0.31), nm, cx, 2.18, cz + 0.05)); plate.castShadow = false;
    box(0.02, 0.2, 0.02, M.shelf, cx, 2.0, cz);
    pickable(plate, "货架与库位标签", { dev: "shelf" });
    blob(cx, cz + 0.1, L + 0.3, D + 0.5, 0.7);
    grid.box(cx, cz, L, D);
  }
  function pallet(x, z) {
    for (const dz of [-0.5, -0.25, 0, 0.25, 0.5]) box(1.2, 0.022, 0.1, M.wood, x, 0.139, z + dz * 1.0 * 0.95);
    for (const dx of [-0.55, 0, 0.55]) box(0.1, 0.1, 1.0, M.woodDark, x + dx, 0.075, z);
    for (const dz of [-0.45, 0, 0.45]) box(1.2, 0.022, 0.1, M.wood, x, 0.011, z + dz);
    blob(x, z, 1.5, 1.3, 0.7);
  }
  function crate(x, z, color, label) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const m = std(color, 0.55);
    mesh(B(0.6, 0.02, 0.4), m, 0, 0.01, 0, g);
    for (const [px, pz, w, d] of [[0, 0.19, 0.6, 0.02], [0, -0.19, 0.6, 0.02], [0.29, 0, 0.02, 0.4], [-0.29, 0, 0.02, 0.4]]) mesh(B(w, 0.32, d), m, px, 0.16, pz, g);
    const c = T.cv(256, 64), gg = c.getContext("2d"); gg.fillStyle = "#fff"; gg.fillRect(0, 0, 256, 64); gg.fillStyle = "#222"; gg.font = T.font(40, "bold"); gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText(label, 128, 34);
    const lb = mesh(new THREE.PlaneGeometry(0.3, 0.075), new THREE.MeshStandardMaterial({ map: T.tex(c) }), 0, 0.2, 0.202, g); lb.castShadow = false;
    blob(x, z, 0.8, 0.6);
    grid.box(x, z, 0.6, 0.4, 0.15);
    return g;
  }
  function cageCart(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    mesh(B(1.0, 0.03, 0.65), M.shelf, 0, 0.18, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mesh(B(0.025, 1.4, 0.025), M.shelf, sx * 0.49, 0.85, sz * 0.31, g);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14).rotateZ(PI / 2), M.rubber, sx * 0.42, 0.06, sz * 0.26, g);
    }
    for (const y of [0.5, 0.9, 1.3]) for (const sz of [-1, 1]) mesh(B(1.0, 0.012, 0.012), M.shelf, 0, y, sz * 0.31, g);
    for (const y of [0.5, 0.9, 1.3]) mesh(B(0.012, 0.012, 0.62), M.shelf, -0.49, y, 0, g);
    const c = T.cv(256, 64), gg = c.getContext("2d"); gg.fillStyle = "#15803d"; gg.fillRect(0, 0, 256, 64); gg.fillStyle = "#fff"; gg.font = T.font(38, "bold"); gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText("待上架", 128, 34);
    const lb = mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshStandardMaterial({ map: T.tex(c) }), 0, 1.15, 0.33, g); lb.castShadow = false;
    g.userData.top = 0.195;
    blob(x, z, 1.2, 0.85);
    grid.box(x, z, 1.0, 0.65, 0.2);
    return g;
  }
  function trolley() {
    const g = new THREE.Group();
    mesh(B(1.0, 0.04, 0.62), std("#2f6fed", 0.5), 0, 0.17, 0, g);
    mesh(B(0.03, 0.85, 0.03), M.steel, -0.48, 0.6, -0.27, g); mesh(B(0.03, 0.85, 0.03), M.steel, -0.48, 0.6, 0.27, g);
    mesh(B(0.03, 0.03, 0.57), M.steel, -0.48, 1.02, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14).rotateX(PI / 2), M.rubber, sx * 0.4, 0.07, sz * 0.25, g);
    g.userData.top = 0.19;
    return g;
  }
  function problemCage(x, z) {
    const c = T.cv(128, 128), g = c.getContext("2d");
    g.clearRect(0, 0, 128, 128); g.strokeStyle = "#fff"; g.lineWidth = 5;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    const mt = T.tex(c, { repeat: [4, 5] });
    const wm = new THREE.MeshStandardMaterial({ color: "#d0a21b", alphaMap: mt, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
    mt.colorSpace = THREE.NoColorSpace;
    const gr = new THREE.Group(); gr.position.set(x, 0, z); scene.add(gr);
    const w = 1.1, d = 1.9, h = 1.5;
    for (const [px, pz, ry, len] of [[w / 2, 0, PI / 2, d], [0, -d / 2, 0, w], [0, d / 2, 0, w]]) {
      const p = mesh(new THREE.PlaneGeometry(len, h), wm, px, h / 2 + 0.05, pz, gr); p.rotation.y = ry;
    }
    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) mesh(B(0.04, h + 0.05, 0.04), std("#c8961a", 0.5, 0.5), px, (h + 0.05) / 2, pz, gr);
    mesh(B(w, 0.03, d), std("#c8961a", 0.5, 0.5), 0, 0.5, 0, gr);
    const st = T.cv(512, 128), sg2 = st.getContext("2d"); sg2.fillStyle = "#dc2626"; sg2.fillRect(0, 0, 512, 128); sg2.fillStyle = "#fff"; sg2.font = T.font(64, "bold"); sg2.textAlign = "center"; sg2.textBaseline = "middle"; sg2.fillText("问题件暂存", 256, 66);
    const sp = mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({ map: T.tex(st) }), w / 2 + 0.01, 1.35, 0, gr); sp.rotation.y = PI / 2; sp.castShadow = false;
    blob(x, z, w + 0.4, d + 0.4);
    grid.box(x, z, w, d);
    gr.userData.slots = [[0, 0.52, -0.55], [0, 0.52, 0.0], [0, 0.52, 0.55], [0, 0.06, -0.5], [0, 0.06, 0.3]];
    return gr;
  }
  function laptop(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = PI / 2; scene.add(g);
    mesh(RB(0.34, 0.018, 0.24, 0.006), M.gray, 0, 0.009, 0, g);
    const lid = new THREE.Group(); lid.position.set(0, 0.018, -0.12); lid.rotation.x = -0.25; g.add(lid);
    mesh(RB(0.34, 0.23, 0.012, 0.006), M.gray, 0, 0.115, 0, lid);
    const scr = T.screen(512, 340, (gg, w, h) => { gg.fillStyle = "#f4f6f9"; gg.fillRect(0, 0, w, h); gg.fillStyle = "#dc2626"; gg.fillRect(0, 0, w, 40); gg.fillStyle = "#fff"; gg.font = T.font(22, "bold"); gg.fillText("问题件台账系统", 14, 27); gg.fillStyle = "#334"; gg.font = T.font(17); ["单号", "类型", "处置", "跟进人"].forEach((s, i) => gg.fillText(s, 14 + i * 120, 70)); for (let r = 0; r < 6; r++) { gg.fillStyle = r % 2 ? "#e9edf3" : "#fff"; gg.fillRect(8, 82 + r * 38, w - 16, 36); } });
    const sm = mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }), 0, 0.115, 0.007, lid);
    sm.castShadow = false;
    return { g, screen: scr };
  }
  function serviceCounter(x, z, len, ry, label, color) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    mesh(B(len, 1.0, 0.55), M.plastic, 0, 0.5, 0, g);
    mesh(B(len + 0.06, 0.04, 0.68), M.quartz, 0, 1.05, 0.04, g);
    mesh(B(len, 0.12, 0.02), M.gray, 0, 0.06, 0.28, g);
    const c = T.cv(1024, 160), gg = c.getContext("2d");
    gg.fillStyle = "#0f7f86"; gg.fillRect(0, 0, 1024, 160); gg.fillStyle = color; gg.fillRect(0, 140, 1024, 20);
    gg.fillStyle = "#fff"; gg.font = T.font(72, "bold"); gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText(label, 512, 72);
    const p = mesh(new THREE.PlaneGeometry(len * 0.9, len * 0.9 * 160 / 1024), new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.4 }), 0, 0.68, 0.281, g);
    p.castShadow = false;
    const wx = Math.abs(Math.sin(ry)) > 0.5;
    blob(x, z, wx ? 0.9 : len + 0.3, wx ? len + 0.3 : 0.9);
    grid.box(x, z, wx ? 0.6 : len, wx ? len : 0.6);
    return g;
  }
  function officeChair(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -PI / 2; scene.add(g);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), M.steel, 0, 0.25, 0, g);
    for (let i = 0; i < 5; i++) { const l = mesh(B(0.3, 0.03, 0.04), M.black, 0, 0.06, 0, g); l.geometry.translate(0.15, 0, 0); l.rotation.y = i * PI * 0.4; }
    mesh(RB(0.46, 0.08, 0.44, 0.03), M.black, 0, 0.48, 0, g);
    mesh(RB(0.44, 0.5, 0.06, 0.03), M.black, 0, 0.8, 0.22, g);
    blob(x, z, 0.6, 0.6);
    return g;
  }
  function bench(x, z) {
    box(1.6, 0.05, 0.42, M.wood, x, 0.45, z); box(1.6, 0.3, 0.04, M.wood, x, 0.72, z + 0.2);
    for (const sx of [-0.7, 0.7]) box(0.05, 0.45, 0.4, M.alu, x + sx, 0.225, z);
    blob(x, z, 1.9, 0.7); grid.box(x, z, 1.6, 0.45, 0.15);
  }
  function plant(x, z) {
    put(new THREE.CylinderGeometry(0.22, 0.17, 0.45, 18), std("#e9e5dd", 0.5), x, 0.225, z);
    const lg = new THREE.IcosahedronGeometry(0.32, 1);
    const pos = lg.attributes.position, r = T.rng(Math.floor(x * 10 + z));
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.8 + r() * 0.4), pos.getY(i) * (1.3 + r() * 0.3), pos.getZ(i) * (0.8 + r() * 0.4));
    lg.computeVertexNormals();
    put(lg, std("#3f7a3a", 0.8, 0, { flatShading: true }), x, 0.85, z);
    blob(x, z, 0.7, 0.7); grid.box(x, z, 0.44, 0.44, 0.15);
  }
  function buildTrees(list) {
    const fol = [], trunks = [];
    const r = T.rng(17);
    for (const [x, z] of list) {
      const s = 0.85 + r() * 0.5;
      const tg = new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 2.6 * s, 8).translate(x, 1.3 * s, z);
      trunks.push(tg);
      for (let k = 0; k < 7; k++) {
        const g = new THREE.IcosahedronGeometry((0.9 + r() * 0.6) * s, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const f = 0.85 + r() * 0.3; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.85, p.getZ(i) * f); }
        const a = (k / 7) * PI * 2, rr = k ? 0.8 * s : 0;
        g.translate(x + Math.cos(a) * rr, (2.9 + (k ? r() * 0.8 : 1.0)) * s, z + Math.sin(a) * rr);
        const col = new Float32Array(p.count * 3), base = new THREE.Color().setHSL(0.27 + r() * 0.05, 0.45, 0.25 + r() * 0.08);
        for (let i = 0; i < p.count; i++) { const v = 0.75 + (p.getY(i) - (2.4 * s)) * 0.12 + r() * 0.12; col[i * 3] = base.r * v; col[i * 3 + 1] = base.g * v; col[i * 3 + 2] = base.b * v; }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        fol.push(g);
      }
      grid.box(x, z, 0.5, 0.5, 0.15);
    }
    const fm = new THREE.Mesh(mergeGeometries(fol.map((g) => { g.computeVertexNormals(); return g; })), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    fm.castShadow = fm.receiveShadow = true; scene.add(fm);
    const tm = new THREE.Mesh(mergeGeometries(trunks), M.bark); tm.castShadow = tm.receiveShadow = true; scene.add(tm);
    W.foliage = fm;
  }
  function building(x, z, w, d, h, name, seed) {
    const t = T.windowsTex(Math.round(w / 3.2), Math.round(h / 3.2), seed % 2 ? "#d8cdbd" : "#c9d0d6", seed);
    const tz = T.windowsTex(Math.round(d / 3.2), Math.round(h / 3.2), seed % 2 ? "#d8cdbd" : "#c9d0d6", seed + 1);
    const top = std("#8c8f93", 0.9);
    const m = new THREE.Mesh(B(w, h, d), [new THREE.MeshStandardMaterial({ map: tz, roughness: 0.85 }), new THREE.MeshStandardMaterial({ map: tz, roughness: 0.85 }), top, top, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })]);
    m.position.set(x, h / 2, z); m.castShadow = false; m.receiveShadow = true; scene.add(m);
    const c = T.cv(256, 96), g = c.getContext("2d"); g.fillStyle = "#b42318"; g.font = T.font(64, "bold"); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 128, 50);
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), new THREE.MeshBasicMaterial({ map: T.tex(c), transparent: true }));
    const front = z > 0 ? -1 : 1;
    if (Math.abs(x) > 35) { sp.position.set(x - Math.sign(x) * (w / 2 + 0.05), h - 2, z); sp.rotation.y = -Math.sign(x) * PI / 2; }
    else { sp.position.set(x, h - 2, z + front * (d / 2 + 0.05)); sp.rotation.y = front > 0 ? 0 : PI; }
    scene.add(sp);
  }
  function bike(x, z, i) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = PI / 2 + (i % 2 ? 0.05 : -0.05); scene.add(g);
    const fm = std(["#2b5fa8", "#b23a3a", "#3a3a3a", "#e0e0e0", "#2e7d4f"][i % 5], 0.4, 0.5);
    for (const sx of [-0.5, 0.5]) mesh(new THREE.TorusGeometry(0.31, 0.022, 8, 28), M.rubber, sx, 0.33, 0, g);
    mesh(B(0.75, 0.035, 0.035), fm, 0, 0.55, 0, g).rotation.z = 0.12;
    mesh(B(0.035, 0.45, 0.035), fm, -0.15, 0.5, 0, g).rotation.z = 0.3;
    mesh(B(0.035, 0.5, 0.035), fm, 0.38, 0.55, 0, g).rotation.z = -0.3;
    mesh(B(0.22, 0.05, 0.08), M.black, -0.22, 0.76, 0, g);
    mesh(B(0.04, 0.04, 0.5), M.black, 0.45, 0.85, 0, g);
  }
  function lamp(x, z) {
    put(new THREE.CylinderGeometry(0.06, 0.09, 5, 10), M.alu, x, 2.5, z);
    put(B(0.9, 0.06, 0.1), M.alu, x - 0.4, 5.0, z);
    const mat = new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#ffd9a0", emissiveIntensity: 0, roughness: 0.3 });
    const head = mesh(B(0.45, 0.06, 0.22), mat, x - 0.75, 4.97, z); head.castShadow = false;
    const light = new THREE.PointLight("#ffd9a0", 0, 14, 1.4); light.position.set(x - 0.75, 4.8, z); scene.add(light);
    grid.box(x, z, 0.2, 0.2, 0.15);
    return { mat, light };
  }

  // ---------- 设备 ----------
  function makePDA() {
    const g = new THREE.Group();
    const body = mesh(RB(0.078, 0.17, 0.028, 0.008, 3), std("#2a2e35", 0.5), 0, 0, 0, g);
    mesh(RB(0.07, 0.04, 0.034, 0.008, 2), std("#f0b323", 0.55), 0, 0.085, 0.004, g); // 扫描头护套
    mesh(new THREE.PlaneGeometry(0.04, 0.012), new THREE.MeshStandardMaterial({ color: "#5a0b0b", emissive: "#ff2a2a", emissiveIntensity: 0.4, roughness: 0.2 }), 0, 0.1055, 0.004, g).rotation.x = -PI / 2;
    const scr = T.screen(240, 340);
    const sm = mesh(new THREE.PlaneGeometry(0.062, 0.086), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }), 0, 0.028, 0.0142, g); sm.castShadow = false;
    for (let i = 0; i < 12; i++) mesh(RB(0.015, 0.008, 0.004, 0.002, 1), std(i === 10 ? "#2f9e44" : "#3a3f47", 0.5), -0.022 + (i % 3) * 0.022, -0.035 - Math.floor(i / 3) * 0.012, 0.0145, g);
    for (const sx of [-1, 1]) mesh(B(0.006, 0.025, 0.012), std("#f0b323", 0.5), sx * 0.04, 0.02, 0, g);
    const laser = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4, 1, true).rotateX(PI / 2).translate(0, 0, 0.15), new THREE.MeshBasicMaterial({ color: "#ff3030", transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    laser.scale.set(1, 0.05, 1);
    const lg = new THREE.Group(); lg.position.set(0, 0.105, 0.0); lg.rotation.x = -PI / 2; lg.add(laser); g.add(lg);
    return { g, screen: scr, laser, laserGroup: lg, body };
  }
  function makeScale() {
    const g = new THREE.Group();
    mesh(RB(0.42, 0.05, 0.42, 0.01), std("#3a3f45", 0.5), 0, 0.025, 0, g);
    mesh(B(0.4, 0.012, 0.4), M.steel, 0, 0.056, 0, g);
    mesh(B(0.03, 0.28, 0.03), M.gray, 0, 0.16, -0.24, g);
    const head = mesh(RB(0.22, 0.09, 0.05, 0.01), std("#e9e9e6", 0.5), 0, 0.33, -0.24, g); head.rotation.x = -0.2;
    const scr = T.screen(256, 96);
    const sm = mesh(new THREE.PlaneGeometry(0.17, 0.06), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }), 0, 0.33, -0.213, g);
    sm.rotation.x = -0.2; sm.castShadow = false;
    const api = { g, screen: scr, value: 0, stable: true, set(v, stable = true) { api.value = v; api.stable = stable; scr.draw(drawLCD); } };
    function drawLCD(gg, w, h) {
      gg.fillStyle = "#8fbf8a"; gg.fillRect(0, 0, w, h);
      gg.fillStyle = "#14261a"; gg.font = "bold 60px monospace"; gg.textAlign = "right"; gg.textBaseline = "middle";
      gg.fillText(api.value.toFixed(2), w - 46, h / 2 + 4); gg.font = "bold 22px monospace"; gg.fillText("kg", w - 10, h / 2 + 18);
      if (api.stable) { gg.textAlign = "left"; gg.font = "bold 16px monospace"; gg.fillText("STABLE", 8, 18); }
    }
    api.set(0);
    return api;
  }
  function makePrinter() {
    const g = new THREE.Group();
    mesh(RB(0.2, 0.15, 0.24, 0.02), std("#ecebe7", 0.45), 0, 0.075, 0, g);
    mesh(RB(0.19, 0.04, 0.16, 0.015), std("#4b5058", 0.5), 0, 0.155, -0.03, g);
    mesh(B(0.12, 0.008, 0.01), M.black, 0, 0.11, 0.121, g);
    mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshStandardMaterial({ color: "#1f9d55", emissive: "#2cff7a", emissiveIntensity: 0.8 }), 0.07, 0.13, 0.121, g);
    const lc = T.cv(256, 320);
    const ltex = T.tex(lc);
    // 出纸口吐出的面单：平放，从出纸口向前伸出（scale.z 0→1）
    const label = mesh(new THREE.PlaneGeometry(0.1, 0.125).rotateX(-PI / 2).translate(0, 0, 0.0625), new THREE.MeshStandardMaterial({ map: ltex, roughness: 0.6, side: THREE.DoubleSide }), 0, 0.106, 0.121, g);
    label.scale.set(1, 1, 0.001); label.visible = false; label.castShadow = false;
    return { g, label, labelCanvas: lc, labelTex: ltex };
  }
  function makeTapeGun() {
    const g = new THREE.Group();
    mesh(new THREE.TorusGeometry(0.06, 0.025, 10, 24), std("#c9a46a", 0.4, 0, { transparent: true, opacity: 0.9 }), 0, 0.09, 0, g).rotation.y = PI / 2;
    mesh(B(0.04, 0.03, 0.2), std("#d23b32", 0.5), 0, 0.03, -0.05, g);
    mesh(B(0.04, 0.12, 0.03), std("#d23b32", 0.5), 0, 0.07, -0.13, g);
    mesh(B(0.07, 0.01, 0.03), M.steel, 0, 0.02, 0.07, g);
    return g;
  }
  function makeMonitor() {
    const g = new THREE.Group();
    mesh(B(0.22, 0.012, 0.16), M.black, 0, 0.006, 0.04, g);
    mesh(B(0.04, 0.24, 0.025), M.black, 0, 0.13, 0.04, g);
    mesh(RB(0.58, 0.35, 0.03, 0.006), M.black, 0, 0.32, 0.06, g);
    const scr = T.screen(768, 448);
    const sm = mesh(new THREE.PlaneGeometry(0.555, 0.324), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }), 0, 0.32, 0.0765, g); sm.castShadow = false;
    mesh(B(0.42, 0.015, 0.14), std("#2a2d31", 0.6), 0, 0.008, 0.28, g); // 键盘
    return { g, screen: scr };
  }
  function makeKiosk() {
    const g = new THREE.Group();
    mesh(RB(0.56, 0.06, 0.46, 0.02), M.tealDark, 0, 0.03, 0, g);
    mesh(RB(0.4, 1.0, 0.3, 0.04), M.plastic, 0, 0.55, 0, g);
    mesh(B(0.402, 0.5, 0.302), M.teal, 0, 0.35, 0, g);
    const head = new THREE.Group(); head.position.set(0, 1.12, 0.04); head.rotation.x = -0.55; g.add(head);
    mesh(RB(0.48, 0.36, 0.06, 0.02), M.plastic, 0, 0, 0, head);
    const scr = T.screen(640, 480);
    const sm = mesh(new THREE.PlaneGeometry(0.42, 0.315), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }), 0, 0, 0.031, head); sm.castShadow = false;
    // 扫描窗、凭条口
    mesh(B(0.18, 0.012, 0.12), M.glassDark, 0, 1.0, 0.16, g);
    mesh(B(0.12, 0.012, 0.01), M.black, 0, 0.82, 0.152, g);
    // 顶部灯箱
    const c = T.cv(512, 128), gg = c.getContext("2d"); gg.fillStyle = "#0f7f86"; gg.fillRect(0, 0, 512, 128); gg.fillStyle = "#fff"; gg.font = T.font(62, "bold"); gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText("自助出库", 256, 66);
    mesh(B(0.48, 0.12, 0.08), M.plastic, 0, 1.48, -0.05, g);
    const tl = mesh(new THREE.PlaneGeometry(0.46, 0.11), new THREE.MeshStandardMaterial({ map: T.tex(c), emissive: "#fff", emissiveMap: null, emissiveIntensity: 0.25 }), 0, 1.48, -0.009, g);
    tl.material.emissiveMap = tl.material.map;
    return { g, screen: scr };
  }
  function makeLocker() {
    const g = new THREE.Group();
    const cols = 5, cw = 0.6, Hh = 2.0;
    const body = std("#e9ebee", 0.45, 0.3), doorM = std("#f4f5f7", 0.4, 0.25), trim = std("#0f7f86", 0.5);
    mesh(B(cols * cw + 0.06, Hh + 0.1, 0.55), body, 0, (Hh + 0.1) / 2, -0.02, g);
    mesh(B(cols * cw + 0.08, 0.14, 0.6), trim, 0, Hh + 0.17, 0, g);
    mesh(B(cols * cw + 0.06, 0.08, 0.5), M.alu, 0, 0.04, 0, g);
    const cells = [], sizes = { S: 0.22, M: 0.32, L: 0.45 };
    let no = 1;
    for (let c = 0; c < cols; c++) {
      const x = -((cols - 1) / 2) * cw + c * cw;
      if (c === 2) {
        // 主控柜：屏幕 + 扫码口
        const scr = T.screen(360, 480);
        const sm = mesh(new THREE.PlaneGeometry(0.4, 0.533), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }), x, 1.38, 0.262, g);
        sm.castShadow = false;
        mesh(B(0.5, 0.65, 0.01), M.black, x, 1.38, 0.255, g);
        mesh(B(0.14, 0.06, 0.02), M.glassDark, x, 0.98, 0.265, g);
        mesh(B(0.2, 0.012, 0.01), M.black, x, 0.88, 0.262, g);
        g.userData.screen = scr; g.userData.screenMesh = sm;
        const order = ["L", "M"];
        let y = 0.1;
        for (const sz of order) { const h = sizes[sz]; cells.push(cellDoor(x, y, h, sz, no++)); y += h; }
        continue;
      }
      const order = ["L", "L", "M", "M", "S", "S"];
      let y = 0.1;
      for (const sz of order) { const h = sizes[sz]; cells.push(cellDoor(x, y, h, sz, no++)); y += h; }
    }
    function cellDoor(x, y, h, size, n) {
      const pivot = new THREE.Group(); pivot.position.set(x - cw / 2 + 0.012, y + h / 2, 0.262); g.add(pivot);
      const c = T.cv(64, 64), gg = c.getContext("2d"); gg.fillStyle = "#f4f5f7"; gg.fillRect(0, 0, 64, 64); gg.fillStyle = "#475467"; gg.font = T.font(26, "bold"); gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText(String(n), 32, 34);
      const numM = new THREE.MeshStandardMaterial({ map: T.tex(c), roughness: 0.45 });
      const d = mesh(B(cw - 0.024, h - 0.012, 0.018), doorM, cw / 2 - 0.012, 0, 0, pivot);
      const lbl = mesh(new THREE.PlaneGeometry(0.06, 0.06), numM, cw - 0.09, h / 2 - 0.05, 0.0095, pivot); lbl.castShadow = false;
      if (h < 0.06) lbl.visible = false;
      mesh(B(0.01, 0.05, 0.01), M.alu, cw - 0.05, 0, 0.012, pivot);
      return { n, size, x, y, h, pivot, door: d, open: 0, target: 0, occupied: false };
    }
    W.anim.push((dt) => { for (const c of cells) { c.open += (c.target - c.open) * Math.min(1, dt * 6); c.pivot.rotation.y = -c.open * 1.7; } });
    return { g, cells, screen: g.userData.screen, screenMesh: g.userData.screenMesh };
  }
  function buildVan() {
    const g = new THREE.Group();
    const white = std("#f3f4f2", 0.35, 0.2), green = std("#1f6f4a", 0.45, 0.2), dark = M.glassDark;
    // 车身（车尾朝 +z）
    mesh(RB(2.0, 1.9, 3.6, 0.1, 3), white, 0, 1.35, 0.2, g);
    mesh(RB(1.96, 1.35, 1.3, 0.18, 3), white, 0, 1.1, -2.1, g);
    const ws = mesh(B(1.7, 0.6, 0.05), dark, 0, 1.55, -2.72, g); ws.rotation.x = -0.45;
    for (const sx of [-1, 1]) mesh(B(0.02, 0.45, 0.7), dark, sx * 0.985, 1.5, -2.0, g);
    mesh(B(2.02, 0.28, 3.62), green, 0, 0.82, 0.2, g);
    mesh(B(1.98, 0.25, 0.15), std("#2b2b2b", 0.6), 0, 0.5, -2.78, g);
    for (const sx of [-0.7, 0.7]) mesh(B(0.3, 0.12, 0.03), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff6d0", emissiveIntensity: 0.3 }), sx, 0.85, -2.76, g);
    for (const sx of [-0.85, 0.85]) mesh(B(0.12, 0.3, 0.03), new THREE.MeshStandardMaterial({ color: "#a01010", emissive: "#ff2020", emissiveIntensity: 0.3 }), sx, 0.9, 2.02, g);
    // 车厢侧面字样
    const c = T.cv(512, 128), gg = c.getContext("2d"); gg.clearRect(0, 0, 512, 128); gg.fillStyle = "#1f6f4a"; gg.font = T.font(64, "bold"); gg.textBaseline = "middle"; gg.fillText("校园驿站 配送", 20, 66);
    const tm = new THREE.MeshStandardMaterial({ map: T.tex(c), transparent: true, roughness: 0.4 });
    for (const sx of [-1, 1]) { const p = mesh(new THREE.PlaneGeometry(2.6, 0.65), tm, sx * 1.011, 1.55, 0.3, g); p.rotation.y = sx * PI / 2; p.castShadow = false; }
    // 后门（两扇，可打开）
    const doors = [];
    for (const sx of [-1, 1]) {
      const pv = new THREE.Group(); pv.position.set(sx * 0.99, 1.35, 2.02); g.add(pv);
      mesh(B(0.97, 1.8, 0.04), white, -sx * 0.485, 0, 0, pv);
      mesh(B(0.04, 0.3, 0.05), M.alu, -sx * 0.9, 0, 0.03, pv);
      doors.push({ pv, s: sx });
    }
    const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 22).rotateZ(PI / 2);
    const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 16).rotateZ(PI / 2);
    for (const z of [-1.9, 1.2]) for (const sx of [-0.92, 0.92]) { mesh(wg, M.rubber, sx, 0.36, z, g); mesh(rim, M.steel, sx, 0.36, z, g); }
    // 车厢里的包裹
    for (let i = 0; i < 10; i++) mesh(B(0.4 + (i % 3) * 0.1, 0.3 + (i % 2) * 0.1, 0.4), std(["#c1925d", "#b9874f", "#cfa36f"][i % 3], 0.85), -0.5 + (i % 3) * 0.5, 0.7 + Math.floor(i / 6) * 0.4, -0.8 + (i % 4) * 0.4, g);
    grid.block(-9.6, -15.2, -7.4, -9.9, 0.2);
    blob(-8.5, -12.2, 2.6, 5.6, 0.8);
    return { g, doors, open: 0, target: 0 };
  }

  // ---------- 在库包裹（货架上的大批包裹，合并成少量网格） ----------
  function buildFillers() {
    const AW = 2048, AH = 4096, CS = 256, cols = AW / CS, rows = AH / CS;
    const atlas = T.cv(AW, AH), ag = atlas.getContext("2d");
    const items = [];
    const buf = { front: [], card: [], bag: [] };
    const r = T.rng(2026);
    const reserved = new Set();
    for (const s of Object.values(STOCK)) if (s.slot) reserved.add(s.slot.join("-"));
    for (const v of Object.values(SHELF_SLOT)) reserved.add(v.join("-"));
    const used = new Set(Object.values(STOCK).map((s) => s.code).filter(Boolean));
    const carriers = Object.values(CARRIERS);
    const surname = "张王李赵周吴郑孙钱冯陈褚卫蒋沈韩杨朱秦许何吕施曹严金魏陶姜谢邹喻柏窦章苏潘葛范彭鲁马方俞任袁柳";
    let cell = 0;
    function code(s, l) {
      for (;;) {
        const pre = s === 2 && l === 3 && r() < 0.6 ? "06" : ["05", "06", "09", "10", "11", "12"][Math.floor(r() * 6)];
        const c = `${s}-${l}-${pre}${String(Math.floor(r() * 100)).padStart(2, "0")}`;
        if (!used.has(c)) { used.add(c); return c; }
      }
    }
    // 2-3 层里故意放几个和 2-3-0618 很像的取件码
    const forced = { "2-3": ["2-3-0619", "2-3-0616", "2-3-0681", "2-3-0168"] };
    Object.values(forced).flat().forEach((c) => used.add(c));
    function addBox(x, y, z, w, h, d, kind, codeStr, ry = 0) {
      const id = items.length;
      let uv = null;
      if (cell < cols * rows) {
        const cx = (cell % cols) * CS, cy = Math.floor(cell / cols) * CS;
        drawCell(ag, cx, cy, CS, w, h, kind, codeStr, id);
        uv = [cx / AW, 1 - (cy + CS) / AH, (cx + CS) / AW, 1 - cy / AH];
        cell++;
      } else uv = [0, 0, 0.001, 0.001];
      items.push({ id, x, y, z, w, h, d, code: codeStr, kind, ry });
      addQuads(id, x, y, z, w, h, d, kind, uv, r);
      return id;
    }
    function drawCell(g, cx, cy, S, w, h, kind, codeStr, id) {
      g.save(); g.translate(cx, cy);
      const pw = S / (w * 100), ph = S / (h * 100); // 每厘米像素
      g.scale(pw, ph);
      const W_ = w * 100, H_ = h * 100;
      T.drawCardBg(g, 0, 0, W_, H_, kind, id * 7 + 3);
      const car = carriers[id % carriers.length];
      const lw = Math.min(10, W_ * 0.62), lh = Math.min(7.5, H_ * 0.8);
      if (lh > 3) {
        const lx = Math.min(W_ * 0.06 + (id % 3), W_ - lw - 0.5), ly = (H_ - lh) / 2;
        // 面单按 100×76 单位画，再整体缩放
        g.save(); g.translate(lx, ly); g.scale(lw / 100, lh / 76);
        T.drawWaybill(g, 0, 0, 100, 76, { carrier: car.carrier, color: car.color, no: `${car.prefix} ${1000 + id * 37 % 9000} ${2000 + id * 53 % 7000} ${1000 + id * 91 % 9000}`, name: surname[id % surname.length] + "*", phone: `1${3 + id % 6}${id % 10}****${String(1000 + id * 13 % 9000)}`, addr: `本校 ${1 + id % 12} 栋`, seed: id + 5 });
        g.restore();
      }
      const sw = Math.min(7, W_ * 0.42), sh = Math.min(2.8, H_ * 0.62);
      T.drawCodeSticker(g, W_ - sw - Math.min(1.2, W_ * 0.05), Math.min(1, H_ * 0.08), sw, sh, codeStr);
      g.restore();
    }
    function addQuads(id, x, y, z, w, h, d, kind, uv, rr) {
      const hw = w / 2, hh = h / 2, hd = d / 2;
      const tint = kind === "bag" ? 1 : 0.88 + rr() * 0.18;
      const F = [
        ["front", [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]], [0, 0, 1]],
        ["+x", [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]], [1, 0, 0]],
        ["-z", [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]], [0, 0, -1]],
        ["-x", [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]], [-1, 0, 0]],
        ["top", [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]], [0, 1, 0]],
        ["bot", [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]], [0, -1, 0]],
      ];
      for (const [name, pts, n] of F) {
        const b = name === "front" ? buf.front : kind === "bag" ? buf.bag : buf.card;
        let uvs;
        if (name === "front") uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
        else if (name === "top" && kind !== "bag") uvs = [[0.5, 0], [1, 0], [1, 1], [0.5, 1]];
        else uvs = [[0, 0], [0.5, 0], [0.5, 1], [0, 1]];
        for (const i of [0, 1, 2, 0, 2, 3]) {
          const p = pts[i];
          b.push({ p: [x + p[0], y + p[1], z + p[2]], n, uv: uvs[i], c: tint * (name === "bot" ? 0.4 : p[1] < 0 && name !== "top" ? 0.72 : 1), id });
        }
      }
    }
    // 生成
    for (let s = 1; s <= 4; s++) for (let l = 1; l <= 4; l++) {
      const fq = forced[`${s}-${l}`] ? [...forced[`${s}-${l}`]] : [];
      for (let k = 1; k <= 6; k++) {
        if (reserved.has(`${s}-${l}-${k}`)) continue;
        if (r() < 0.08) continue;
        const p = slotPos(s, l, k);
        const nextCode = () => (fq.length ? fq.shift() : code(s, l));
        const pat = r();
        if (pat < 0.35) {
          const w = 0.32 + r() * 0.2, h = 0.16 + r() * 0.2, d = 0.22 + r() * 0.16;
          addBox(p.x + (r() - 0.5) * 0.04, p.y + h / 2, p.front - d / 2 - r() * 0.02, w, h, d, "card", nextCode());
        } else if (pat < 0.7) {
          for (const sx of [-1, 1]) {
            const w = 0.2 + r() * 0.06, h = 0.1 + r() * 0.2, d = 0.18 + r() * 0.14;
            addBox(p.x + sx * 0.145, p.y + h / 2, p.front - d / 2 - r() * 0.02, w, h, d, r() < 0.25 ? "bag" : "card", nextCode());
          }
        } else if (pat < 0.88) {
          let y = p.y;
          const n = 2 + Math.floor(r() * 2);
          for (let i = 0; i < n; i++) { const w = 0.3 + r() * 0.12, h = 0.06 + r() * 0.04, d = 0.24 + r() * 0.1; addBox(p.x + (r() - 0.5) * 0.06, y + h / 2, p.front - d / 2, w, h, d, "bag", nextCode()); y += h; }
        } else {
          const w = 0.3 + r() * 0.1, h = 0.14 + r() * 0.08, d = 0.24 + r() * 0.1;
          addBox(p.x, p.y + h / 2, p.front - d / 2, w, h, d, "card", nextCode());
          const w2 = 0.26 + r() * 0.06, h2 = 0.07;
          addBox(p.x + (r() - 0.5) * 0.04, p.y + h + h2 / 2, p.front - 0.12, w2, h2, 0.22, "bag", nextCode());
        }
      }
    }
    // 5 号大件区
    for (let k = 1; k <= 5; k++) {
      if (reserved.has(`5-1-${k}`)) continue;
      const p = slotPos(5, 1, k);
      const w = 0.5 + r() * 0.12, h = 0.35 + r() * 0.25, d = 0.45 + r() * 0.2;
      addBox(p.x, p.y + h / 2, p.front - d / 2 - 0.05, w, h, d, "card", code(5, 1));
      if (r() < 0.5) { const h2 = 0.25 + r() * 0.15; addBox(p.x, p.y + h + h2 / 2, p.front - 0.3, w * 0.8, h2, 0.42, "card", code(5, 1)); }
    }
    const atex = T.tex(atlas, { aniso: 8 });
    const cbTex = T.cardboardTex(); const bgTex = T.bagTex();
    const group = new THREE.Group();
    const meshes = [];
    function mk(list, mat) {
      const n = list.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uvA = new Float32Array(n * 2), col = new Float32Array(n * 3);
      const tri = new Int32Array(n / 3);
      list.forEach((v, i) => {
        pos.set(v.p, i * 3); nor.set(v.n, i * 3); uvA.set(v.uv, i * 2); col.set([v.c, v.c, v.c], i * 3);
        if (i % 3 === 0) tri[i / 3] = v.id;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uvA, 2)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
      m.userData.tri = tri;
      m.userData.pick = { name: "在库包裹", filler: true };
      group.add(m); meshes.push(m);
      return m;
    }
    mk(buf.front, new THREE.MeshStandardMaterial({ map: atex, vertexColors: true, roughness: 0.82 }));
    mk(buf.card, new THREE.MeshStandardMaterial({ map: cbTex, vertexColors: true, roughness: 0.88 }));
    mk(buf.bag, new THREE.MeshStandardMaterial({ map: bgTex, vertexColors: true, roughness: 0.5 }));
    return { group, meshes, items, itemAt: (mesh, faceIndex) => items[mesh.userData.tri[faceIndex]] };
  }

  return W;
}

// ---------- 可交互的单个包裹 ----------
const sharedTex = {};
function cardMats() {
  if (!sharedTex.side) {
    const t = T.cardboardTex();
    sharedTex.side = t.clone(); sharedTex.side.repeat.set(0.5, 1); sharedTex.side.needsUpdate = true;
    sharedTex.bag = T.bagTex();
    sharedTex.sideMat = new THREE.MeshStandardMaterial({ map: sharedTex.side, roughness: 0.88 });
    sharedTex.bagMat = new THREE.MeshStandardMaterial({ map: sharedTex.bag, roughness: 0.5, color: "#e6e8ea" });
  }
  return sharedTex;
}
// p：快件数据（size = [长 x, 高 y, 宽 z]，面单在顶面）
export function makeParcel(p) {
  const S = cardMats();
  const [w, h, d] = p.size;
  const seg = p.dmg === "torn" ? 8 : 1;
  const geo = p.bag ? new RoundedBoxGeometry(w, h, d, 2, Math.min(h * 0.45, 0.03)) : new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  if (p.dmg === "torn") {
    // 压塌一个角
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = Math.max(0, (x / (w / 2)) * 0.5 + (y / (h / 2)) * 0.5 - (z / (d / 2)) * 0.5 - 0.2);
      pos.setXYZ(i, x - k * 0.035, y - k * k * 0.07, z + k * 0.03 + Math.sin(x * 60) * 0.004 * k);
    }
    geo.computeVertexNormals();
  }
  const car = CARRIERS[p.c];
  const px = 11; // 每厘米像素
  const tc = T.cv(Math.round(w * 100 * px), Math.round(d * 100 * px)), tg = tc.getContext("2d");
  const topTex = T.tex(tc);
  function drawTop(code) {
    const Wc = tc.width, Hc = tc.height;
    tg.clearRect(0, 0, Wc, Hc);
    T.drawCardBg(tg, 0, 0, Wc, Hc, p.bag ? "bag" : "card", p.no.length * 13 + p.kg * 10);
    if (!p.bag) {
      const gr = tg.createLinearGradient(0, Hc * 0.42, 0, Hc * 0.58);
      gr.addColorStop(0, "rgba(160,110,50,.5)"); gr.addColorStop(0.5, "rgba(225,175,105,.55)"); gr.addColorStop(1, "rgba(150,100,45,.5)");
      tg.fillStyle = gr; tg.fillRect(0, Hc * 0.42, Wc, Hc * 0.16);
    }
    const lw = Math.min(Wc * 0.62, 10 * px * 1.25), lh = lw * 0.76;
    const lx = Wc * 0.08, ly = Math.max(4, (Hc - lh) / 2);
    if (!p.noLabel) T.drawWaybill(tg, lx, ly, lw, lh, { ...car, no: p.no, name: p.name, phone: p.phone, addr: p.addr, kg: p.kg, goods: p.goods, from: p.from, seed: p.no.length + p.kg * 100 }, { wrinkle: p.label === "wrinkle", blur: p.label === "blur" });
    if (p.fragile) {
      const fx = lx + lw + Wc * 0.04, fw = Math.min(Wc - fx - 6, 6 * px), fh = fw * 0.8;
      tg.fillStyle = "#d62f2f"; tg.fillRect(fx, ly, fw, fh);
      tg.fillStyle = "#fff"; tg.font = T.font(fh * 0.32, "bold"); tg.textAlign = "center"; tg.fillText("易碎", fx + fw / 2, ly + fh * 0.42); tg.font = T.font(fh * 0.2, "bold"); tg.fillText("小心轻放", fx + fw / 2, ly + fh * 0.75); tg.textAlign = "left";
    }
    if (code) {
      const sw = Math.min(7 * px, Wc * 0.36), sh = sw * 0.4;
      T.drawCodeSticker(tg, Wc - sw - px, px * 0.8, sw, sh, code);
    }
    topTex.needsUpdate = true;
  }
  drawTop(p.code);
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: p.bag ? 0.5 : 0.85 });
  let backMat = p.bag ? S.bagMat : S.sideMat;
  if (p.dmg === "torn") {
    const bc = T.cv(Math.round(w * 100 * 6), Math.round(h * 100 * 6)), bg = bc.getContext("2d");
    T.drawCardBg(bg, 0, 0, bc.width, bc.height, "card", 99);
    bg.fillStyle = "#3a2410"; bg.beginPath();
    const cx = bc.width * 0.62, cy = bc.height * 0.4;
    for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2, rr = (0.12 + ((i * 37) % 10) / 60) * bc.height; bg.lineTo(cx + Math.cos(a) * rr * 1.6, cy + Math.sin(a) * rr); }
    bg.closePath(); bg.fill();
    bg.strokeStyle = "rgba(240,215,170,.9)"; bg.lineWidth = 3; bg.stroke();
    bg.strokeStyle = "rgba(60,40,20,.5)"; bg.lineWidth = 2;
    for (let i = 0; i < 8; i++) { bg.beginPath(); bg.moveTo(cx + (i - 4) * 14, cy - 50); bg.lineTo(cx + (i - 4) * 18 + 10, cy + 60); bg.stroke(); }
    bg.fillStyle = "rgba(30,20,10,.25)"; bg.fillRect(bc.width * 0.5, 0, bc.width * 0.5, bc.height * 0.3);
    backMat = new THREE.MeshStandardMaterial({ map: T.tex(bc), roughness: 0.9 });
  }
  const side = p.bag ? S.bagMat : S.sideMat;
  const m = new THREE.Mesh(geo, p.bag ? topMat : [side, side, topMat, side, side, backMat]);
  m.castShadow = m.receiveShadow = true;
  m.userData.parcel = p;
  m.userData.setCode = (c) => { p.code = c; drawTop(c); };
  m.userData.redraw = () => drawTop(p.code);
  return m;
}

// 包裹在货架上的位置和朝向（面单朝外：顶面转向 +z；快递袋平放）
export function shelfPlace(p, s, l, k, offset = 0, inward = false) {
  const [, h, d] = p.size;
  const sp = slotPos(s, l, k);
  if (p.bag) return { pos: new THREE.Vector3(sp.x + offset, sp.y + h / 2 + 0.002, sp.front - d / 2), quat: new THREE.Quaternion() };
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(inward ? -PI / 2 : PI / 2, 0, 0));
  // 旋转后：世界 y 方向尺寸 = d，世界 z 方向尺寸 = h
  return { pos: new THREE.Vector3(sp.x + offset, sp.y + d / 2 + 0.002, sp.front - h / 2), quat };
}
