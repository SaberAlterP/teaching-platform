// 五种运输方式 · 滚动驱动的 3D 场景
// 构建：npm run demo:build  → demo-content/dist/五种运输方式-3D.html（单文件，可直接上传到平台）
import * as THREE from "three";

const ZONES = [
  { key: "road", x: 0 },
  { key: "rail", x: 75 },
  { key: "water", x: 150 },
  { key: "air", x: 225 },
  { key: "pipe", x: 300 },
];

// ---------- 基础 ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);
scene.fog = new THREE.Fog(0xdbeafe, 140, 420);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb7a0, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 50, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 150 });
scene.add(sun, sun.target);

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...opts });
function box(w, h, d, color, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(rt, rb, h, color, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = m.receiveShadow = true;
  return m;
}

// 地面
const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 160), mat(0xa7c99a));
ground.rotation.x = -Math.PI / 2;
ground.position.set(150, 0, 0);
ground.receiveShadow = true;
scene.add(ground);

function tree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = cyl(0.25 * s, 0.3 * s, 1.4 * s, 0x8b5a2b, 6);
  trunk.position.y = 0.7 * s;
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.2 * s, 2.6 * s, 7), mat(0x3f8f4f));
  top.position.y = 2.6 * s;
  top.castShadow = true;
  g.add(trunk, top);
  g.position.set(x, 0, z);
  scene.add(g);
}
const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
for (let i = 0; i < 90; i++) {
  const x = -30 + rand() * 360;
  const z = (rand() > 0.5 ? 1 : -1) * (14 + rand() * 30);
  if (x > 118 && x < 182) continue; // 水域不种树
  tree(x, z, 0.8 + rand() * 0.6);
}

const animators = [];

// ---------- 1. 公路 ----------
{
  const X = ZONES[0].x;
  box(70, 0.1, 7, 0x4b5563, X, 0.05, 0);
  for (let i = -32; i < 34; i += 4) box(2, 0.12, 0.25, 0xf8fafc, X + i, 0.07, 0);
  function truck(color) {
    const g = new THREE.Group();
    box(6, 2.6, 2.4, color, -1, 1.9, 0, g); // 货厢
    box(2, 2, 2.3, 0xe5e7eb, 3, 1.6, 0, g); // 驾驶室
    box(0.1, 0.8, 1.9, 0x60a5fa, 4.02, 2, 0, g); // 挡风玻璃
    for (const x of [-3, -1.5, 2.8]) for (const z of [-1.1, 1.1]) {
      const w = cyl(0.5, 0.5, 0.4, 0x111827, 10);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.5, z);
      g.add(w);
    }
    scene.add(g);
    return g;
  }
  const trucks = [truck(0xf97316), truck(0x2563eb), truck(0x16a34a)];
  animators.push((t) => {
    trucks.forEach((tr, i) => {
      const lane = i % 2 === 0 ? 1.7 : -1.7;
      const dir = i % 2 === 0 ? 1 : -1;
      const p = (((t * 7 + i * 23) % 70) + 70) % 70 - 35;
      tr.position.set(X + p * dir, 0, lane);
      tr.rotation.y = dir > 0 ? 0 : Math.PI;
    });
  });
  // 仓库（门到门）
  box(8, 5, 8, 0xe2e8f0, X - 18, 2.5, -9);
  box(8.4, 0.5, 8.4, 0x94a3b8, X - 18, 5.2, -9);
  box(8, 5, 8, 0xfef3c7, X + 18, 2.5, 9);
  box(8.4, 0.5, 8.4, 0xd97706, X + 18, 5.2, 9);
}

// ---------- 2. 铁路 ----------
{
  const X = ZONES[1].x;
  box(80, 0.3, 5, 0x9ca3af, X, 0.15, 0);
  for (let i = -40; i <= 40; i += 1.5) box(0.4, 0.2, 3.6, 0x78350f, X + i, 0.4, 0);
  box(80, 0.25, 0.2, 0x374151, X, 0.6, -1.2);
  box(80, 0.25, 0.2, 0x374151, X, 0.6, 1.2);
  const train = new THREE.Group();
  box(7, 3, 2.8, 0xdc2626, 0, 2.2, 0, train);
  box(1.5, 1.2, 2.2, 0x1f2937, 3.2, 3.2, 0, train);
  const colors = [0x2563eb, 0x0891b2, 0x16a34a, 0xea580c, 0x7c3aed, 0x2563eb];
  colors.forEach((c, i) => box(7, 2.8, 2.6, c, -8 * (i + 1), 2.1, 0, train));
  scene.add(train);
  animators.push((t) => { train.position.set(X + (((t * 9) % 110) - 45), 0, 0); });
  // 站台
  box(20, 1.2, 4, 0xd6d3d1, X + 10, 0.6, -5);
  box(20, 0.3, 5, 0x57534e, X + 10, 4.5, -5);
}

// ---------- 3. 水路 ----------
{
  const X = ZONES[2].x;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(56, 90, 40, 60), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.1, flatShading: true }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(X, 0.6, 0);
  scene.add(water);
  const pos = water.geometry.attributes.position;
  const base = Float32Array.from(pos.array);
  // 码头与岸桥
  box(10, 1.4, 60, 0x9ca3af, X - 22, 0.7, 0);
  for (const z of [-8, 8]) {
    const crane = new THREE.Group();
    box(0.6, 12, 0.6, 0xf59e0b, 0, 6, -2, crane);
    box(0.6, 12, 0.6, 0xf59e0b, 0, 6, 2, crane);
    box(16, 0.8, 1, 0xf59e0b, 4, 12.2, 0, crane);
    crane.position.set(X - 22, 1.4, z);
    scene.add(crane);
  }
  const ship = new THREE.Group();
  box(26, 3, 7, 0x1e3a8a, 0, 1.5, 0, ship);
  box(4, 6, 6, 0xf8fafc, -10, 5.5, 0, ship);
  const cc = [0xef4444, 0x22c55e, 0xf59e0b, 0x3b82f6, 0xa855f7];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++)
    box(2.8, 1.4, 2, cc[(i + j * 2 + k) % cc.length], -4 + i * 3, 3.7 + k * 1.45, -2.2 + j * 2.2, ship);
  scene.add(ship);
  animators.push((t) => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      pos.array[i * 3 + 2] = Math.sin(x * 0.3 + t * 1.5) * 0.2 + Math.cos(y * 0.25 + t) * 0.15;
    }
    pos.needsUpdate = true;
    ship.position.set(X + 4, 0.4 + Math.sin(t * 1.2) * 0.2, Math.sin(t * 0.25) * 6);
    ship.rotation.x = Math.sin(t * 1.1) * 0.03;
    ship.rotation.y = Math.PI / 2;
  });
}

// ---------- 4. 航空 ----------
{
  const X = ZONES[3].x;
  box(70, 0.12, 10, 0x374151, X, 0.06, 0);
  for (let i = -30; i < 32; i += 6) box(3, 0.14, 0.4, 0xffffff, X + i, 0.08, 0);
  box(10, 6, 10, 0xcbd5e1, X - 20, 3, -16);
  const tower = cyl(1, 1.4, 12, 0xe2e8f0);
  tower.position.set(X + 20, 6, -16);
  scene.add(tower);
  const plane = new THREE.Group();
  const body = cyl(1.1, 0.9, 14, 0xf8fafc, 16);
  body.rotation.z = Math.PI / 2;
  plane.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.5, 16), mat(0xf8fafc));
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 8.2;
  plane.add(nose);
  box(3, 0.25, 16, 0x2563eb, 0.5, 0, 0, plane); // 机翼
  box(1.6, 3, 0.25, 0x2563eb, -6.4, 1.6, 0, plane); // 垂尾
  box(1.6, 0.2, 5, 0x2563eb, -6.4, 0.4, 0, plane);
  plane.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(plane);
  animators.push((t) => {
    const c = (t * 0.18) % 1; // 一个起降循环
    const x = X - 30 + c * 90;
    const y = c < 0.35 ? 1.6 : 1.6 + Math.pow((c - 0.35) / 0.65, 1.6) * 30;
    plane.position.set(x, y, 0);
    plane.rotation.z = c < 0.35 ? 0 : 0.18;
    plane.visible = c < 0.95;
  });
}

// ---------- 5. 管道 ----------
{
  const X = ZONES[4].x;
  for (const z of [-2, 2]) {
    const p = cyl(1.2, 1.2, 70, 0x9ca3af, 20);
    p.rotation.z = Math.PI / 2;
    p.position.set(X, 1.8, z);
    scene.add(p);
    for (let i = -30; i <= 30; i += 8) box(0.6, 1.2, 1.2, 0x6b7280, X + i, 0.6, z);
  }
  // 储罐
  for (const [dx, dz] of [[-24, -12], [-16, -12], [24, 12], [16, 12]]) {
    const tank = cyl(3.5, 3.5, 7, 0xf1f5f9, 24);
    tank.position.set(X + dx, 3.5, dz);
    scene.add(tank);
  }
  // 流动的"油"
  const blobs = [];
  for (let i = 0; i < 16; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    scene.add(b);
    blobs.push(b);
  }
  animators.push((t) => {
    blobs.forEach((b, i) => {
      const p = ((t * 8 + i * 8.75) % 70) - 35;
      b.position.set(X + (i % 2 ? p : -p), 3.3, i % 2 ? -2 : 2);
    });
  });
}

// ---------- 镜头随滚动移动 ----------
// 文字卡片左右交替出现，镜头把场景主体偏到卡片的另一侧
const views = ZONES.map((z, i) => {
  const shift = i % 2 === 0 ? 13 : -13; // 卡片在右 → 看向右边，主体落在画面左侧
  return {
    pos: new THREE.Vector3(z.x + shift - 20, 20 + (i === 3 ? 8 : 0), 38),
    look: new THREE.Vector3(z.x + shift, i === 3 ? 8 : 1, 0),
  };
});
views.unshift({ pos: new THREE.Vector3(70, 110, 170), look: new THREE.Vector3(185, 0, 0) }); // 开场全景
views.push({ pos: new THREE.Vector3(230, 120, 180), look: new THREE.Vector3(120, 0, 0) }); // 结尾全景

let target = 0;
let current = 0;
const sections = [...document.querySelectorAll(".panel")];
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  target = max > 0 ? (scrollY / max) * (views.length - 1) : 0;
  const idx = Math.round(target);
  sections.forEach((s, i) => s.classList.toggle("active", i === idx));
  document.getElementById("bar").style.width = `${(max > 0 ? scrollY / max : 0) * 100}%`;
  if (idx === views.length - 1 && !onScroll.done) {
    onScroll.done = true;
    parent.postMessage({ type: "tp:complete" }, "*");
  }
}
addEventListener("scroll", onScroll, { passive: true });

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const tmpP = new THREE.Vector3();
const tmpL = new THREE.Vector3();
function applyCamera(v) {
  const i = Math.min(Math.floor(v), views.length - 2);
  const f = ease(Math.min(1, Math.max(0, v - i)));
  tmpP.lerpVectors(views[i].pos, views[i + 1].pos, f);
  tmpL.lerpVectors(views[i].look, views[i + 1].look, f);
  camera.position.copy(tmpP);
  camera.lookAt(tmpL);
  sun.position.set(tmpL.x + 30, 50, 25);
  sun.target.position.copy(tmpL);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
onScroll();

const timer = new THREE.Timer();
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const t = timer.getElapsed();
  const dt = Math.min(0.1, timer.getDelta());
  current += (target - current) * (1 - Math.exp(-dt * 4)); // 与帧率无关的平滑
  applyCamera(current);
  animators.forEach((a) => a(t));
  renderer.render(scene, camera);
});
