// 程序生成的贴图：地砖、墙面、纸箱、面单、标牌、屏幕等（不依赖任何外部图片，单文件可离线运行）
import * as THREE from "three";

// 可复现的随机数
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
export function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = o.aniso ?? 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}
// 颗粒噪点
export function grain(g, w, h, amt, r = Math.random) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}
const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
export const font = (px, w = "normal") => `${w} ${px}px ${FONT}`;

// ---------- 室内地砖（60cm 水磨石砖，一张图 = 2×2 块）----------
export function floorTex() {
  const S = 1024, c = cv(S, S), g = c.getContext("2d"), r = rng(11);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const v = 194 + (r() - 0.5) * 12;
    g.fillStyle = `rgb(${v},${v - 2},${v - 7})`;
    g.fillRect(i * 512, j * 512, 512, 512);
    for (let k = 0; k < 1400; k++) {
      const s = r() * 2.6 + 0.6, t = r();
      g.fillStyle = t < 0.45 ? `rgba(110,104,96,${0.25 + r() * 0.35})` : t < 0.8 ? "rgba(250,248,244,.55)" : "rgba(150,128,104,.4)";
      g.fillRect(i * 512 + r() * 512, j * 512 + r() * 512, s, s);
    }
  }
  grain(g, S, S, 9, r);
  g.fillStyle = "#9d998f";
  g.fillRect(0, 0, 2, S); g.fillRect(S - 2, 0, 2, S); g.fillRect(510, 0, 4, S);
  g.fillRect(0, 0, S, 2); g.fillRect(0, S - 2, S, 2); g.fillRect(0, 510, S, 4);
  // 粗糙度图：砖面光滑、缝粗糙，夹杂淡淡的擦痕
  const rc = cv(256, 256), rg = rc.getContext("2d");
  rg.fillStyle = "#7a7a7a"; rg.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 40; k++) {
    rg.strokeStyle = `rgba(160,160,160,${0.1 + r() * 0.2})`; rg.lineWidth = 6 + r() * 14;
    rg.beginPath(); const x = r() * 256, y = r() * 256; rg.moveTo(x, y); rg.quadraticCurveTo(x + 40, y + r() * 40 - 20, x + 80 * r(), y + r() * 60); rg.stroke();
  }
  rg.fillStyle = "#e0e0e0"; rg.fillRect(0, 0, 1, 256); rg.fillRect(255, 0, 1, 256); rg.fillRect(127, 0, 2, 256);
  rg.fillRect(0, 0, 256, 1); rg.fillRect(0, 255, 256, 1); rg.fillRect(0, 127, 256, 2);
  return { map: tex(c), rough: tex(rc, { srgb: false }) };
}

// ---------- 室外铺装（透水砖 + 石材）----------
export function paverTex() {
  const S = 512, c = cv(S, S), g = c.getContext("2d"), r = rng(5);
  g.fillStyle = "#8d8a84"; g.fillRect(0, 0, S, S);
  const bw = 64, bh = 32;
  for (let y = 0; y < S; y += bh) for (let x = -(y / bh % 2) * bw / 2; x < S; x += bw) {
    const v = 150 + (r() - 0.5) * 30, t = r();
    g.fillStyle = t < 0.15 ? `rgb(${v * 0.9},${v * 0.78},${v * 0.7})` : `rgb(${v},${v - 3},${v - 8})`;
    g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
  }
  grain(g, S, S, 22, r);
  return tex(c);
}
export function grassTex() {
  const S = 256, c = cv(S, S), g = c.getContext("2d"), r = rng(9);
  g.fillStyle = "#56743a"; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 5000; k++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(40,70,25,.5)` : v < 0.85 ? `rgba(120,150,70,.45)` : `rgba(150,140,80,.4)`;
    g.fillRect(r() * S, r() * S, 1.2, 2 + r() * 3);
  }
  return tex(c);
}
export function asphaltTex() {
  const S = 256, c = cv(S, S), g = c.getContext("2d"), r = rng(3);
  g.fillStyle = "#4a4c50"; g.fillRect(0, 0, S, S);
  grain(g, S, S, 40, r);
  return tex(c);
}

// ---------- 墙面乳胶漆 ----------
export function wallTex() {
  const S = 256, c = cv(S, S), g = c.getContext("2d"), r = rng(21);
  g.fillStyle = "#ece9e3"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.015})`; g.fillRect(r() * S, 0, 8 + r() * 20, S); }
  grain(g, S, S, 6, r);
  return tex(c);
}
// 吊顶 600×600 矿棉板
export function ceilTex() {
  const S = 256, c = cv(S, S), g = c.getContext("2d"), r = rng(31);
  g.fillStyle = "#efede8"; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(120,115,105,${0.08 + r() * 0.15})`; g.fillRect(r() * S, r() * S, 1.4, 1.4); }
  g.fillStyle = "#d8d5ce"; g.fillRect(0, 0, S, 4); g.fillRect(0, 0, 4, S);
  return tex(c);
}
// 外墙铝板
export function cladTex() {
  const S = 256, c = cv(S, S), g = c.getContext("2d"), r = rng(41);
  g.fillStyle = "#c9ccd0"; g.fillRect(0, 0, S, S);
  g.fillStyle = "#9da2a8"; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);
  grain(g, S, S, 8, r);
  return tex(c);
}
// 卷帘门
export function rollerTex() {
  const c = cv(64, 256), g = c.getContext("2d");
  for (let y = 0; y < 256; y += 16) {
    const gr = g.createLinearGradient(0, y, 0, y + 16);
    gr.addColorStop(0, "#c8ccd1"); gr.addColorStop(0.5, "#eef0f2"); gr.addColorStop(0.85, "#a9aeb5"); gr.addColorStop(1, "#7d838b");
    g.fillStyle = gr; g.fillRect(0, y, 64, 16);
  }
  return tex(c, { repeat: [1, 6] });
}

// ---------- 纸箱 ----------
// 左半：纯纸板（侧面）；右半：带封箱胶带（顶面）
export function cardboardTex() {
  const W = 512, H = 256, c = cv(W, H), g = c.getContext("2d"), r = rng(77);
  g.fillStyle = "#c1925d"; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 900; k++) {
    g.strokeStyle = `rgba(${r() < 0.5 ? "90,60,30" : "230,200,150"},${0.05 + r() * 0.08})`;
    g.lineWidth = 0.6 + r();
    const y = r() * H; g.beginPath(); g.moveTo(r() * W, y); g.lineTo(r() * W, y + (r() - 0.5) * 3); g.stroke();
  }
  grain(g, W, H, 14, r);
  // 顶面：中缝 + 胶带
  g.fillStyle = "rgba(70,45,20,.55)"; g.fillRect(256 + 126, 0, 3, H);
  const tg = g.createLinearGradient(256 + 96, 0, 256 + 160, 0);
  tg.addColorStop(0, "rgba(160,110,50,.55)"); tg.addColorStop(0.5, "rgba(220,170,100,.55)"); tg.addColorStop(1, "rgba(150,100,45,.55)");
  g.fillStyle = tg; g.fillRect(256 + 96, 0, 64, H);
  g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(256 + 100, 0, 6, H);
  return tex(c);
}
// 快递袋（灰色塑料）
export function bagTex() {
  const S = 256, c = cv(S, S), g = c.getContext("2d"), r = rng(13);
  g.fillStyle = "#d9dbdd"; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 60; k++) {
    g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.3 + r() * 0.3})` : `rgba(90,95,100,${0.12 + r() * 0.12})`;
    g.lineWidth = 2 + r() * 6;
    g.beginPath(); const x = r() * S, y = r() * S; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 60); g.stroke();
  }
  return tex(c);
}

// ---------- 面单 ----------
function barcode(g, x, y, w, h, seed) {
  const r = rng(seed);
  g.fillStyle = "#111";
  let cx = x;
  while (cx < x + w - 2) {
    const bw = (1 + Math.floor(r() * 3)) * (w / 140);
    if (r() < 0.55) g.fillRect(cx, y, bw, h);
    cx += bw + (w / 140) * (1 + Math.floor(r() * 2));
  }
}
function qr(g, x, y, s, seed) {
  const r = rng(seed), n = 21, m = s / n;
  g.fillStyle = "#111";
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r() < 0.48) g.fillRect(x + i * m, y + j * m, m, m);
  for (const [a, b] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    g.fillStyle = "#111"; g.fillRect(x + a * m, y + b * m, 7 * m, 7 * m);
    g.fillStyle = "#fff"; g.fillRect(x + (a + 1) * m, y + (b + 1) * m, 5 * m, 5 * m);
    g.fillStyle = "#111"; g.fillRect(x + (a + 2) * m, y + (b + 2) * m, 3 * m, 3 * m);
  }
}
// 在 (x,y) 画一张 w×h 的电子面单（单位：像素）
export function drawWaybill(g, x, y, w, h, p, o = {}) {
  const u = w / 100; // 面单宽 = 100 个单位
  g.save();
  g.fillStyle = "#fbfbf8"; g.fillRect(x, y, w, h);
  g.strokeStyle = "#222"; g.lineWidth = Math.max(1, u * 0.4); g.strokeRect(x + u, y + u, w - 2 * u, h - 2 * u);
  g.fillStyle = p.color || "#1e6fd9"; g.fillRect(x + u, y + u, w - 2 * u, 11 * u);
  g.fillStyle = "#fff"; g.font = font(7 * u, "bold"); g.textBaseline = "middle";
  g.fillText(p.carrier || "快递", x + 4 * u, y + 6.5 * u);
  g.font = font(5 * u); g.textAlign = "right"; g.fillText("标准快递", x + w - 4 * u, y + 6.5 * u); g.textAlign = "left";
  barcode(g, x + 6 * u, y + 15 * u, w - 12 * u, 15 * u, p.seed || 1);
  g.fillStyle = "#111"; g.font = font(5 * u, "bold"); g.textAlign = "center";
  g.fillText(p.no || "", x + w / 2, y + 34 * u); g.textAlign = "left";
  g.fillStyle = "#222"; g.fillRect(x + u, y + 38 * u, w - 2 * u, 0.4 * u);
  g.font = font(6.5 * u, "bold"); g.fillText("收 " + (p.name || "") + "  " + (p.phone || ""), x + 4 * u, y + 44 * u);
  g.font = font(5 * u); g.fillText(p.addr || "", x + 4 * u, y + 52 * u);
  g.fillRect(x + u, y + 57 * u, w - 2 * u, 0.3 * u);
  g.fillStyle = "#555"; g.font = font(4 * u);
  g.fillText("寄 " + (p.from || "电商仓 发货中心"), x + 4 * u, y + 62 * u);
  g.fillText("重量 " + (p.kg != null ? p.kg + "kg" : "--") + "   内件：" + (p.goods || "日用品"), x + 4 * u, y + 68 * u);
  if (h / u > 80) qr(g, x + w - 22 * u, y + h - 22 * u, 18 * u, (p.seed || 1) + 9);
  g.restore();
  // 条码褶皱反光
  if (o.wrinkle) {
    g.save();
    for (let i = 0; i < 4; i++) {
      const gx = x + (20 + i * 18) * u;
      const gr = g.createLinearGradient(gx, y, gx + 10 * u, y + 30 * u);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.85)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.moveTo(gx, y + 12 * u); g.lineTo(gx + 8 * u, y + 12 * u); g.lineTo(gx + 14 * u, y + 36 * u); g.lineTo(gx + 6 * u, y + 36 * u); g.fill();
      g.strokeStyle = "rgba(60,60,60,.35)"; g.lineWidth = u * 0.5; g.beginPath(); g.moveTo(gx + 8 * u, y + 12 * u); g.lineTo(gx + 14 * u, y + 36 * u); g.stroke();
    }
    g.restore();
  }
  // 面单模糊（受潮、磨损）
  if (o.blur) {
    const tc = cv(Math.ceil(w), Math.ceil(h)), tg = tc.getContext("2d");
    tg.drawImage(g.canvas, x, y, w, h, 0, 0, w, h);
    g.save(); g.filter = `blur(${Math.max(2, u * 1.4)}px)`; g.drawImage(tc, x, y); g.restore();
    g.save(); const r = rng(5);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(${120 + r() * 40},${110 + r() * 30},${90 + r() * 20},${0.25 + r() * 0.25})`;
      g.beginPath(); g.ellipse(x + r() * w, y + r() * h, (8 + r() * 18) * u, (3 + r() * 6) * u, r() * 3, 0, 7); g.fill();
    }
    g.restore();
  }
}
// 驿站贴的取件码标签
export function drawCodeSticker(g, x, y, w, h, code) {
  g.save();
  g.fillStyle = "#ffd84a"; g.fillRect(x, y, w, h);
  g.strokeStyle = "#1a1a1a"; g.lineWidth = Math.max(1, h * 0.05); g.strokeRect(x + h * 0.06, y + h * 0.06, w - h * 0.12, h - h * 0.12);
  g.fillStyle = "#111"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = font(h * 0.58, "bold"); g.fillText(code, x + w / 2, y + h * 0.56);
  g.restore();
}
// 纸板 / 塑料袋底色
export function drawCardBg(g, x, y, w, h, kind, seed) {
  const r = rng(seed);
  if (kind === "bag") {
    const v = 205 + r() * 30;
    g.fillStyle = r() < 0.3 ? `rgb(${v * 0.62},${v * 0.66},${v * 0.72})` : `rgb(${v},${v},${v + 3})`;
    g.fillRect(x, y, w, h);
    for (let i = 0; i < 10; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.3})`; g.lineWidth = (2 + r() * 5) * Math.max(w, h) / 256;
      g.beginPath(); g.moveTo(x + r() * w, y + r() * h); g.lineTo(x + r() * w, y + r() * h); g.stroke();
    }
  } else {
    const k = 0.9 + r() * 0.2;
    g.fillStyle = `rgb(${193 * k},${146 * k},${93 * k})`; g.fillRect(x, y, w, h);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(90,60,30,${0.05 + r() * 0.07})`; g.lineWidth = Math.max(w, h) / 300;
      const yy = y + r() * h; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy + (r() - 0.5) * 2); g.stroke();
    }
    if (r() < 0.4) { g.fillStyle = "rgba(60,40,20,.55)"; g.font = font(h * 0.12, "bold"); g.fillText(["↑↑ THIS SIDE UP", "电商物流", "怕湿 ☂", "FRAGILE"][Math.floor(r() * 4)], x + w * 0.05, y + h * 0.2); }
  }
}

// ---------- 标牌、海报、屏幕 ----------
export function signTex(text, color, sub = "", w = 768, h = 192) {
  const c = cv(w, h), g = c.getContext("2d");
  g.fillStyle = "#fbfbfa"; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.fillRect(0, 0, h, h);
  g.fillStyle = "#fff"; g.font = font(h * 0.62, "bold"); g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text[0], h / 2, h * 0.54);
  g.textAlign = "left"; g.fillStyle = "#1f2a3a"; g.font = font(h * 0.36, "bold");
  g.fillText(text.slice(1).trim(), h + h * 0.18, sub ? h * 0.38 : h * 0.54);
  if (sub) { g.font = font(h * 0.2); g.fillStyle = "#5b6676"; g.fillText(sub, h + h * 0.2, h * 0.74); }
  g.fillStyle = color; g.fillRect(h, h - 10, w - h, 10);
  return tex(c);
}
export function posterTex(title, lines, color = "#2f6fed", w = 512, h = 720) {
  const c = cv(w, h), g = c.getContext("2d");
  g.fillStyle = "#fdfdfb"; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.fillRect(0, 0, w, 96);
  g.fillStyle = "#fff"; g.font = font(42, "bold"); g.textBaseline = "middle"; g.fillText(title, 28, 50);
  let y = 140;
  for (const l of lines) {
    const big = l.startsWith("#");
    g.fillStyle = big ? color : "#1f2a3a"; g.font = font(big ? 30 : 25, big ? "bold" : "normal");
    const s = big ? l.slice(1) : l;
    // 自动换行
    let line = "";
    for (const ch of s) {
      if (g.measureText(line + ch).width > w - 60) { g.fillText(line, 30, y); y += big ? 40 : 35; line = ""; }
      line += ch;
    }
    g.fillText(line, 30, y); y += big ? 46 : 38;
  }
  g.strokeStyle = "#c8ccd2"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  return tex(c);
}
// 可刷新的屏幕
export function screen(w, h, draw) {
  const c = cv(w, h), g = c.getContext("2d"), t = tex(c, { aniso: 4 });
  const api = {
    canvas: c, g, tex: t,
    draw(fn = draw) { g.save(); fn(g, w, h); g.restore(); t.needsUpdate = true; },
  };
  if (draw) api.draw();
  return api;
}
// 楼房窗格
export function windowsTex(cols, rows, wall = "#d9cfc0", seed = 1) {
  const W = 512, H = 512, c = cv(W, H), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const v = r();
    g.fillStyle = v < 0.12 ? "#f3e6b8" : v < 0.5 ? "#7f97ab" : "#5d7487";
    g.fillRect(i * cw + cw * 0.18, j * ch + ch * 0.2, cw * 0.64, ch * 0.55);
    g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(i * cw + cw * 0.18, j * ch + ch * 0.2, cw * 0.64, ch * 0.08);
    g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(i * cw + cw * 0.12, j * ch + ch * 0.78, cw * 0.76, ch * 0.05);
  }
  grain(g, W, H, 10, r);
  return tex(c);
}
export function barkTex() {
  const c = cv(64, 128), g = c.getContext("2d"), r = rng(8);
  g.fillStyle = "#5b4636"; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "30,22,15" : "120,100,80"},.4)`; g.fillRect(r() * 64, r() * 128, 1 + r() * 2, 6 + r() * 20); }
  return tex(c);
}
