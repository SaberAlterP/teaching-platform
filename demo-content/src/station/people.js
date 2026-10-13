// 人物：顾客、快递员、同事、路人。几何体拼装，带走路摆臂动画。
import * as THREE from "three";

const cache = new Map();
const mat = (c, rough = 0.8) => {
  const k = c + "|" + rough;
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough }));
  return cache.get(k);
};
const G = {
  leg: new THREE.CapsuleGeometry(0.066, 0.66, 4, 10).translate(0, -0.4, 0),
  shoe: new THREE.BoxGeometry(0.1, 0.07, 0.25).translate(0, -0.8, 0.04),
  hip: new THREE.CapsuleGeometry(0.13, 0.12, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.75),
  torso: new THREE.CapsuleGeometry(0.155, 0.34, 6, 14).scale(1, 1, 0.62),
  arm: new THREE.CapsuleGeometry(0.046, 0.5, 4, 8).translate(0, -0.29, 0),
  hand: new THREE.SphereGeometry(0.048, 10, 8).translate(0, -0.6, 0),
  neck: new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10),
  head: new THREE.SphereGeometry(0.105, 20, 16).scale(0.92, 1.06, 1),
  hair: new THREE.SphereGeometry(0.113, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.94, 1.06, 1.03),
  hairBack: new THREE.SphereGeometry(0.115, 16, 12).scale(0.98, 1.4, 0.72),
  eye: new THREE.SphereGeometry(0.011, 8, 6),
  nose: new THREE.SphereGeometry(0.016, 8, 6).scale(0.8, 1.2, 1.1),
  ear: new THREE.SphereGeometry(0.022, 8, 6).scale(0.45, 1, 0.75),
  brow: new THREE.BoxGeometry(0.028, 0.006, 0.006),
  mouth: new THREE.BoxGeometry(0.032, 0.005, 0.004),
  bag: new THREE.BoxGeometry(0.28, 0.36, 0.13),
  cap: new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
  brim: new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.3),
  vest: new THREE.CapsuleGeometry(0.162, 0.3, 6, 14).scale(1, 1, 0.64),
};

export class Person {
  constructor(o = {}) {
    const s = o.scale || 1;
    this.g = new THREE.Group();
    this.body = new THREE.Group(); this.body.scale.setScalar(s); this.g.add(this.body);
    const skin = mat(o.skin || "#e7c3a1", 0.6), shirt = mat(o.shirt || "#3b6fb6"), pants = mat(o.pants || "#2f3542"), shoes = mat(o.shoes || "#f2f2f2", 0.6), hair = mat(o.hair || "#1d1a18", 0.55);
    const hipY = 0.86;
    this.legs = [-1, 1].map((side) => {
      const p = new THREE.Group(); p.position.set(side * 0.085, hipY, 0);
      p.add(new THREE.Mesh(G.leg, pants), new THREE.Mesh(G.shoe, shoes));
      this.body.add(p); return p;
    });
    const hip = new THREE.Mesh(G.hip, pants); hip.position.y = hipY + 0.02; this.body.add(hip);
    const torso = new THREE.Mesh(G.torso, shirt); torso.position.y = hipY + 0.31; this.body.add(torso);
    if (o.vest) { const v = new THREE.Mesh(G.vest, mat(o.vest)); v.position.y = hipY + 0.33; this.body.add(v); }
    this.arms = [-1, 1].map((side) => {
      const p = new THREE.Group(); p.position.set(side * 0.2, hipY + 0.5, 0); p.rotation.z = side * 0.06;
      p.add(new THREE.Mesh(G.arm, o.sleeve ? mat(o.sleeve) : shirt), new THREE.Mesh(G.hand, skin));
      this.body.add(p); return p;
    });
    const neck = new THREE.Mesh(G.neck, skin); neck.position.y = hipY + 0.6; this.body.add(neck);
    this.head = new THREE.Group(); this.head.position.y = hipY + 0.75; this.body.add(this.head);
    this.head.add(new THREE.Mesh(G.head, skin));
    if (o.cap) {
      const c = new THREE.Mesh(G.cap, mat(o.cap)); c.position.y = 0.012; this.head.add(c);
      const b = new THREE.Mesh(G.brim, mat(o.cap)); b.position.set(0, 0.03, 0.085); this.head.add(b);
    } else {
      const h = new THREE.Mesh(G.hair, hair); h.position.y = 0.008; h.rotation.x = -0.25; this.head.add(h);
      if (o.long) { const hb = new THREE.Mesh(G.hairBack, hair); hb.position.set(0, -0.065, -0.04); this.head.add(hb); }
    }
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(G.eye, mat("#1a1a1a", 0.3)); e.position.set(side * 0.036, 0.012, 0.094); this.head.add(e);
      const b = new THREE.Mesh(G.brow, hair); b.position.set(side * 0.037, 0.036, 0.096); b.rotation.z = side * -0.12; this.head.add(b);
      const ear = new THREE.Mesh(G.ear, skin); ear.position.set(side * 0.096, 0.0, 0.0); this.head.add(ear);
    }
    const nose = new THREE.Mesh(G.nose, skin); nose.position.set(0, -0.012, 0.104); this.head.add(nose);
    const mouth = new THREE.Mesh(G.mouth, mat("#a0524a", 0.6)); mouth.position.set(0, -0.05, 0.094); this.head.add(mouth);
    if (o.bag) { const b = new THREE.Mesh(G.bag, mat(o.bag)); b.position.set(0, hipY + 0.33, -0.15); this.body.add(b); }
    this.g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.speed = o.speed || 1.25;
    this.phase = Math.random() * 6; this.swing = 0; this.path = null; this.t = Math.random() * 10;
    this.name = o.name || "";
    this.carry = null;
  }
  at(x, z, face = 0) { this.g.position.set(x, 0, z); this.g.rotation.y = face; return this; }
  face(x, z) { this.targetYaw = Math.atan2(x - this.g.position.x, z - this.g.position.z); }
  // 沿路径走，返回 Promise
  walk(points) {
    return new Promise((res) => { this.path = points.map((p) => new THREE.Vector2(p[0], p[1])); this.onArrive = res; });
  }
  hold(obj) {
    // 双手捧着物体
    this.carry = obj;
    if (obj) { this.body.add(obj); obj.position.set(0, 1.05, 0.28); obj.rotation.set(0, 0, 0); }
  }
  update(dt) {
    this.t += dt;
    const p = this.g.position;
    let moving = false;
    if (this.path && this.path.length) {
      const tgt = this.path[0], dx = tgt.x - p.x, dz = tgt.y - p.z, d = Math.hypot(dx, dz);
      if (d < 0.06) { this.path.shift(); if (!this.path.length) { this.path = null; const f = this.onArrive; this.onArrive = null; if (f) f(); } }
      else {
        const st = Math.min(d, this.speed * dt);
        p.x += (dx / d) * st; p.z += (dz / d) * st;
        this.targetYaw = Math.atan2(dx, dz);
        moving = true;
      }
    }
    if (this.targetYaw != null) {
      let dy = this.targetYaw - this.g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.g.rotation.y += dy * Math.min(1, dt * 8);
    }
    this.swing += ((moving ? 1 : 0) - this.swing) * Math.min(1, dt * 6);
    if (moving) this.phase += dt * this.speed * 5.2;
    const a = Math.sin(this.phase) * 0.55 * this.swing;
    this.legs[0].rotation.x = a; this.legs[1].rotation.x = -a;
    if (!this.carry) { this.arms[0].rotation.x = -a * 0.8; this.arms[1].rotation.x = a * 0.8; }
    else { this.arms[0].rotation.x = this.arms[1].rotation.x = -1.1; }
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.03 * this.swing + Math.sin(this.t * 1.6) * 0.003;
  }
}

// 预设的人物外观
export const LOOKS = {
  courier: { shirt: "#1f6f4a", sleeve: "#1f6f4a", pants: "#24303c", cap: "#1f6f4a", vest: "#2a8a5c", shoes: "#2b2b2b" },
  coworker: { shirt: "#eef2f6", vest: "#0f8a8a", pants: "#2c3440", hair: "#2a1d16", long: true },
  zhou: { shirt: "#c24b3c", pants: "#3a4a63", bag: "#2b2f36", hair: "#151210" },
  wu: { shirt: "#e6b84a", pants: "#2e3440", hair: "#2b1f17", bag: "#3d5a80" },
  sun: { shirt: "#5b6470", pants: "#2a2d33", hair: "#4a4a4a", scale: 1.02 },
  lin: { shirt: "#7aa6d6", pants: "#e7e1d6", hair: "#1b1512", long: true, scale: 0.96 },
  walker1: { shirt: "#8fbf6a", pants: "#353c48", bag: "#202020" },
  walker2: { shirt: "#f2f2f2", pants: "#5a6a85", hair: "#3b2a1e", long: true, scale: 0.95 },
  walker3: { shirt: "#3d3f6b", pants: "#202428", bag: "#9b2c2c" },
};
