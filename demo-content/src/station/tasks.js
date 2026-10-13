// 岗位任务脚本：一个班次从早到晚，五个岗位 + 岗前准备 + 日终提案
import * as THREE from "three";
import { makeParcel, shelfPlace, slotPose } from "./world.js";
import { TASKS, ZONES, DEVICES, INBOUND, Q1, STOCK, SHELF_SLOT, SHELF_RULES, CARRIERS, ruleShelf, grade, DIMS } from "./data.js";
import { $, toast, panel, ask, order, form, talk, hideTalk, device, padHtml, overlay, score, beep, esc } from "./ui.js";
import { drawWaybill } from "./tex.js";

const PI = Math.PI;
const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;
let G, W;
const PM = {}; // 包裹网格
const state = { done: {}, running: null, distLearned: false, codeN: 1, inbound: { ok: [], exc: [] } };
const MENTOR = "企业导师 · 王师傅";
const WORKER_ID = "SX2026";

// ---------- 站位（镜头机位） ----------
const ST = {
  hall: { name: "驿站大厅", stand: [0, 5.0] },
  aTable: { name: "A 区入库台", stand: [-8.5, -4.15], eye: [-8.3, 1.78, -3.35], look: [-7.7, 0.7, -5.45] },
  aScan: { name: "A 区入库台", stand: [-8.5, -4.15], eye: [-8.5, 1.36, -4.42], look: [-8.5, 0.86, -5.18] },
  aDoor: { name: "A 区入库台", stand: [-8.5, -4.15], eye: [-8.5, 1.62, -4.05], look: [-8.9, 1.15, -8.6] },
  bCart: { name: "待上架笼车", stand: [-4.3, -2.55], eye: [-4.3, 1.58, -2.45], look: [-4.3, 0.55, -3.5] },
  cKiosk: { name: "自助出库终端", stand: [6.8, 6.35], eye: [6.75, 1.52, 6.4], look: [6.8, 1.1, 7.35] },
  cDesk: { name: "出库服务台（员工侧）", stand: [9.65, 4.0], eye: [9.75, 1.55, 4.0], look: [7.4, 1.25, 4.0] },
  cPC: { name: "出库服务台（员工侧）", stand: [9.65, 4.0], eye: [9.45, 1.42, 3.62], look: [8.6, 1.36, 3.25] },
  locker: { name: "门外智能快递柜", stand: [5.5, 10.95], eye: [5.5, 1.55, 10.95], look: [5.5, 1.2, 12.3] },
  dCounter: { name: "D 区寄件柜台", stand: [-9.75, 4.6], eye: [-9.8, 1.52, 4.6], look: [-7.6, 1.05, 4.6] },
  dTable: { name: "D 区打包台", stand: [-9.75, 4.6], eye: [-10.25, 1.5, 4.6], look: [-11.45, 0.82, 4.6] },
  eDesk: { name: "E 区问题件处理台", stand: [-9.7, -0.2], eye: [-9.0, 1.68, 0.35], look: [-11.3, 0.7, -0.45] },
};
const TABLE = new V3(-8.5, 0.86, -5.15);

// ---------- 小工具 ----------
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
function mk(spec, extra = {}) {
  const p = { ...spec, ...extra };
  const m = makeParcel(p);
  G.scene.add(m); G.addPick(m); PM[p.id] = m;
  return m;
}
function move(m, pos, quat, dur = 0.7, arc = 0.25) {
  const p0 = m.position.clone(), q0 = m.quaternion.clone();
  return G.tween(dur, (k) => {
    const e = ease(k);
    m.position.lerpVectors(p0, pos, e); m.position.y += Math.sin(e * PI) * arc;
    if (quat) m.quaternion.slerpQuaternions(q0, quat, e);
  });
}
function toScene(m) { G.scene.attach(m); }
// 拿在手上（挂到镜头前）
async function carry(m, slot = 0) {
  G.camera.attach(m);
  const big = Math.max(...m.userData.parcel.size);
  const z = -0.48 - big * 0.9;
  await move(m, new V3(-0.06 + slot * 0.16, -0.3 - big * 0.4 - slot * 0.05, z), new Q().setFromEuler(new E(0.6, 0.1 * slot, 0)), 0.5, 0.04);
}
async function shelve(m, s, l, k, offset = 0, inward = false) {
  toScene(m);
  const t = shelfPlace(m.userData.parcel, s, l, k, offset, inward);
  await move(m, t.pos, t.quat, 0.7, 0.12);
}
function placeShelfNow(m, s, l, k, offset = 0, inward = false) {
  const t = shelfPlace(m.userData.parcel, s, l, k, offset, inward);
  m.position.copy(t.pos); m.quaternion.copy(t.quat);
}
const half = (m) => m.userData.parcel.size[1] / 2;
function onTable(m) { return new V3(TABLE.x, TABLE.y + half(m), TABLE.z); }
function rotY(m, a = PI / 2) { return move(m, m.position.clone(), new Q().setFromAxisAngle(new V3(0, 1, 0), a).multiply(m.quaternion), 0.45, 0.04); }
function newCode(s, l) { return `${s}-${l}-${1300 + state.codeN++}`; }
const btnWait = (list) => new Promise((res) => panel.btns(list.map((b) => ({ ...b, fn: () => { panel.btns([]); res(b.v ?? b.label); } }))));
async function npcGo(p, x, z) {
  const path = W.grid.path(p.g.position.x, p.g.position.z, x, z);
  if (path) await p.walk(path.slice(1)); else await p.walk([[x, z]]);
}
async function npcLeave(p) {
  await npcGo(p, 0, 10.5);
  await p.walk([[p.g.position.x < 0 ? -4 : 4, 14.5], [p.g.position.x < 0 ? -30 : 30, 14.5]]);
  G.despawn(p);
}
function screenText(scr, title, lines, color = "#0f7f86") {
  scr.draw((g, w, h) => {
    g.fillStyle = "#f2f6fb"; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 0, w, h * 0.12);
    g.fillStyle = "#fff"; g.font = `bold ${Math.round(h * 0.065)}px sans-serif`; g.textBaseline = "middle"; g.fillText(title, w * 0.04, h * 0.06);
    let y = h * 0.22;
    for (const l of lines) {
      const big = l.startsWith("#"), red = l.startsWith("!");
      g.fillStyle = red ? "#c62828" : big ? "#0b1f4d" : "#334155";
      g.font = `${big || red ? "bold " : ""}${Math.round(h * (big ? 0.075 : 0.055))}px sans-serif`;
      g.fillText(l.replace(/^[#!]/, ""), w * 0.05, y); y += h * (big ? 0.11 : 0.085);
    }
  });
}
const infoTable = (p) => `<table>
  <tr><td>单号</td><td><b>${p.no}</b></td></tr><tr><td>快递公司</td><td>${CARRIERS[p.c].carrier}</td></tr>
  <tr><td>收件人</td><td>${p.name}　${p.phone}</td></tr><tr><td>地址</td><td>${p.addr}</td></tr>
  <tr><td>重量</td><td>${p.kg} kg　尺寸 ${p.size.map((v) => Math.round(v * 100)).join("×")} cm</td></tr>
  ${p.fragile ? '<tr><td>标识</td><td class="err">易碎品</td></tr>' : ""}</table>`;
const pdaOpt = { bar: "驿站作业系统", barR: "工号 " + WORKER_ID };
const pdaRun = (html, keys, o = {}) => device.run("pda", "PDA（巴枪）", html, keys, { ...pdaOpt, ...o });

// ---------- 任务进度 ----------
let cur = null;
function begin(id) {
  const t = TASKS.find((x) => x.id === id);
  cur = { ...t, doneSteps: new Set() };
  score.task = id;
  panel.setTask(t);
  G.setTime(t.time);
  $("#phase").textContent = `${t.name} · ${t.role}`;
  G.setZone(t.zone);
}
function stepOn(i) { panel.step(i, "on"); $("#qbox").innerHTML = ""; }
function stepOk(i) {
  if (!cur.doneSteps.has(i)) { cur.doneSteps.add(i); score.steps[cur.id] = cur.doneSteps.size; }
  panel.step(i, "ok");
}
function finish() {
  state.done[cur.id] = true;
  G.release(); G.clearBeacon(); G.setZone(null); device.hide(); hideTalk();
  if (G.holding) G.holdPDA(false);
  panel.instr(`<b>✔ ${cur.full}</b> 完成。`);
  panel.btns([]);
  report(false);
}

// ============ 初始布置 ============
function setupWorld() {
  // 推车上的 6 件来件（在卷帘门外）
  INBOUND.forEach((s, i) => {
    const m = mk(s);
    const h = s.size[1];
    W.trolley.add(m);
    const col = i % 3, row = Math.floor(i / 3);
    m.position.set(-0.3 + col * 0.31, W.trolley.userData.top + h / 2 + row * 0.24, row ? 0.12 : -0.1);
    m.rotation.y = (i % 2 ? 0.1 : -0.08);
    if (row) m.position.y = W.trolley.userData.top + 0.25 + h / 2;
  });
  // 预置在库件
  for (const [k, s] of Object.entries(STOCK)) {
    const m = mk(s);
    if (k === "fallen") { m.position.set(2.0, m.userData.parcel.size[1] / 2, -6.05); m.rotation.y = 0.7; continue; }
    if (k === "locker") { m.position.set(8.66, 1.07 + s.size[1] / 2, 4.65); m.rotation.y = PI / 2; continue; }
    placeShelfNow(m, ...s.slot, k === "liu" ? -0.13 : 0, k === "inward");
  }
  // 问题件区原有的地址不详件
  const q = mk(Q1);
  const sl = W.cage.userData.slots[0];
  q.position.set(W.cage.position.x + sl[0], sl[1] + Q1.size[1] / 2, W.cage.position.z + sl[2]);
  // 智能柜：占用格口 + 12 号柜门未关
  const occ = [1, 2, 3, 5, 7, 8, 9, 13, 14, 15, 16, 17, 19, 21, 22, 24, 25];
  for (const c of W.dev.locker.cells) c.occupied = occ.includes(c.n);
  W.dev.locker.cells.find((c) => c.n === 12).target = 0.35;
  lockerIdle();
  screenText(W.dev.kiosk.screen, "自助出库", ["#请输入取件码", "或扫描取件码二维码", "", "取件后请当面检查外包装"]);
  screenText(W.dev.monitor.screen, "驿站管理系统", ["#今日在库 412 件", "待上架 0 件 · 问题件 1 件", "", "快捷键：F2 查询  F3 出库"], "#334155");
  W.dev.scale.set(0);
}
function lockerIdle() {
  const n = W.dev.locker.cells.filter((c) => !c.occupied).length;
  screenText(W.dev.locker.screen, "智能快递柜", ["#取件请输入取件码", `空闲格口 ${n} 个`, "", "⚠ 12 号格口柜门未关"], "#0f7f86");
}
function ensureInbound() {
  if (state.done.in) return;
  for (const s of INBOUND) {
    const m = PM[s.id]; toScene(m);
    if (["P1", "P2", "P3", "P4"].includes(s.id)) { putInCart(m, ["P1", "P2", "P3", "P4"].indexOf(s.id)); }
    else putInCrate(m, s.id === "P5" ? 0 : 1);
  }
  W.roller.target = 0;
}
const CART = [[-0.25, -0.2], [0.25, -0.2], [-0.2, 0.12], [0.27, 0.16]];
function cartPos(m, i) {
  const c = W.cageCart.position, h = m.userData.parcel.size[1], [dx, dz] = CART[i % 4];
  return new V3(c.x + dx, W.cageCart.userData.top + h / 2 + (i >= 4 ? 0.3 : 0), c.z + dz);
}
function putInCart(m, i) { m.position.copy(cartPos(m, i)); m.quaternion.identity(); }
function cratePos(m, i) { const c = W.excCrate.position; return new V3(c.x + (i ? 0.12 : -0.12), 0.05 + half(m) + i * 0.0, c.z); }
function putInCrate(m, i) { m.position.copy(cratePos(m, i)); m.quaternion.setFromEuler(new E(0, i ? 0.3 : -0.2, 0)); }
function cageSlot(i) { const sl = W.cage.userData.slots[i]; return new V3(W.cage.position.x + sl[0], sl[1], W.cage.position.z + sl[2]); }

// ============ 岗前准备 ============
async function taskPrep() {
  begin("prep");
  stepOn(0);
  G.mentor.at(1.6, 5.6, PI);
  await G.goto(ST.hall, "欢迎来到校园驿站！先<b>走进驿站大厅</b>（拖动画面转身，W/S 前后走，或点地面）。");
  G.mentor.face(G.P.x, G.P.z);
  await talk(MENTOR, "你好，我是驿站的企业导师王师傅。今天你跟一个完整班次：<b>早班到件入库 → 上架 → 午间取件高峰 → 下午寄件 → 问题件处理</b>，最后写一份流程优化提案。");
  await talk(MENTOR, "工牌上是你的实训工号 <b>" + WORKER_ID + "</b>，登录 PDA 要用。先带你认认场地。");
  stepOk(0);

  stepOn(1);
  const looks = { A: [-8.5, 1, -5], B: [2.5, 1, -5.5], C: [8.6, 1, 4], D: [-9.5, 1, 4.6], E: [-10.8, 1, -0.6] };
  for (const k of Object.keys(ZONES)) {
    const z = ZONES[k];
    G.setZone(k);
    panel.instr(`<b style="color:${z.color}">${z.name}</b><br>${z.duty}`);
    await G.flyTo({ eye: [0, 1.75, 3.6], look: looks[k] }, 0.9);
    await btnWait([{ label: k === "E" ? "看完了" : "下一个区 ▶", primary: true }]);
  }
  G.setZone(null);
  G.release();
  panel.instr("小测一下：");
  await ask("一件外包装<b>破损</b>的快件，入库时挑出后应送到哪个区？", Object.values(ZONES).map((z) => z.name), 4, { dim: "biz", explain: "破损、面单模糊、地址不详等问题件统一放到 <b>E 问题件暂存区</b>，登记后由异常处理员跟进。" });
  await ask("顾客拿着取件码来取快递，应该接待到哪里？", Object.values(ZONES).map((z) => z.name), 2, { dim: "biz", explain: "取件、咨询在 <b>C 出库服务台</b> 办理，门口还有自助出库终端和智能快递柜。" });
  await order("按时间顺序排出驿站一天的主要作业：", ["早班到件入库", "分拣上架", "午间取件高峰", "下午寄件高峰", "晚班盘点与异常清理"], [], { dim: "biz", explain: "上午到件多，中午和傍晚是取件高峰，下午学生寄件集中，晚班做盘点和问题件清理、交接班。" });
  stepOk(1);

  stepOn(2);
  const devObjs = { pda: W.dev.pda.g, kiosk: W.dev.kiosk.g, locker: W.dev.locker.screenMesh, printer: W.dev.printer.g, scale: W.dev.scale.g, shelf: W.pick.find((o) => o.userData.pick.dev === "shelf"), sealer: W.dev.sealer, monitor: W.dev.monitor.g };
  const stands = { pda: [-8.5, -4.15], kiosk: [6.8, 6.35], locker: [5.5, 10.95], printer: [-9.75, 5.3], scale: [-9.75, 3.9], shelf: [0, -6.3], sealer: [-9.75, 4.6], monitor: [7.4, 3.4] };
  Object.entries(devObjs).forEach(([k, o]) => !G.seenDev.has(k) && G.hl(o, true));
  const left = () => DEVICES.filter((d) => !G.seenDev.has(d.key));
  const refresh = () => {
    const l = left();
    panel.instr(`在驿站里找到并<b>点击 8 种设备</b>（会发蓝光），右侧会显示它的作用、标准操作和常见错误。<br>已认识 <b>${8 - l.length}/8</b>${l.length ? "：还差 " + l.map((d) => d.name).join("、") : ""}<span class="tip">智能快递柜在门外右侧。</span>`);
    panel.btns(l.length ? [{ label: "带我去下一台", primary: true, fn: () => { const n = left()[0]; if (n) G.walkTo(...stands[n.key]); } }] : []);
  };
  G.devHook = (k) => { G.hl(devObjs[k], false); setTimeout(refresh, 0); return false; };
  refresh();
  await G.until(() => left().length === 0);
  G.devHook = null; panel.btns([]);
  stepOk(2);

  stepOn(3);
  device.hide();
  panel.instr("设备小测（对应 AN-21 设备认知）：");
  await ask("顾客报了取件码，需要查出库位、取件后核销出库，用哪台设备？", ["自动出库终端", "电子秤", "面单打印机", "封箱器"], 0, { dim: "dev", explain: "自动出库终端：输入取件码 → 显示库位 → 取件 → 回终端扫描核销 → 打印凭条。" });
  await ask("PDA 扫描时“嘟嘟”两声、屏幕显示“未识别”，说明什么？", ["条码没有识别成功，要调整距离/角度重扫，仍不行再手工录入", "扫描成功，可以直接放走", "PDA 没电了，需要充电"], 0, { dim: "dev", explain: "清脆的“滴”一声是成功；“嘟嘟”是异常提示音，不能忽略。" });
  await ask("下面哪种贴单方式是<b>错误</b>的？", ["面单贴在封箱胶带上，盖住箱子接缝", "面单贴在箱子最大的平整面上", "面单平整无褶皱、条码完整不被遮挡"], 0, { dim: "dev", explain: "面单不能盖住封口和接缝（开箱时会被划破），也不能贴在棱角、弯折处。" });
  stepOk(3);
  await talk(MENTOR, "不错！设备都认识了。8 点半第一车快件就到，去 <b>A 入库区</b> 准备吧。");
  finish();
}

// ============ 快件入库 ============
async function taskIn() {
  begin("in");
  G.mentor.at(-6.6, -3.2, -PI * 0.75);
  stepOn(0);
  await G.goto(ST.aTable, "前往 <b>A 入库作业区</b> 的入库台（地面光圈处）");
  await talk(MENTOR, "早班到件马上来。先把 <b>PDA</b> 开机登录，选好作业功能。");
  panel.instr("点击入库台右侧充电座上的 <b>PDA</b>，拿起来。");
  await G.clickOn(W.dev.pda.g);
  G.holdPDA(true);
  G.pdaDraw(["#开机中…"]);
  // 登录
  let first = true;
  for (;;) {
    panel.instr("在右侧 PDA 屏幕上输入<b>工号</b>登录（工号在工牌上）。");
    const r = await pdaRun(`<div class="big">驿站作业系统</div><div style="margin:6px 0">工号<input type="text" name="id" placeholder="请输入工号" autocomplete="off"></div><div>密码<input type="text" name="pw" value="••••••" disabled></div>`, [{ act: "login", label: "登 录", cls: "primary wide" }], { bar: "开机", barR: "电量 92%" });
    if (r.v.id.toUpperCase() === WORKER_ID) { if (first) score.rec("dev", true, "PDA 登录"); break; }
    if (first) score.rec("dev", false, "PDA 登录工号输入错误");
    first = false; beep(false); toast("工号不对。你的实训工号是 " + WORKER_ID, "bad");
  }
  beep(true);
  G.pdaDraw(["#登录成功", "工号 " + WORKER_ID, "请选择作业功能"]);
  await pdaMenu("到件入库", "早班到件要做“到件入库”。上架、出库是之后的环节。");
  stepOk(0);

  // 车辆到站
  stepOn(1);
  await G.flyTo(ST.aDoor);
  panel.instr("配送车到站，打开卷帘门……");
  W.roller.target = 1; await G.wait(1600);
  W.van.target = 1;
  const courier = G.spawn("courier", -8.9, -9.9, 0, "配送员");
  await G.wait(700);
  // 配送员推着平板车进来
  const tr = W.trolley, from = tr.position.clone(), mid = new V3(-8.1, 0, -7.0), to = new V3(-6.75, 0, -5.75);
  const pc = courier.walk([[-8.9, -8.6], [-8.6, -7.6], [-7.2, -6.95]]);
  await G.tween(1.6, (k) => tr.position.lerpVectors(from, mid, ease(k)));
  await G.tween(1.2, (k) => tr.position.lerpVectors(mid, to, ease(k)));
  await pc;
  courier.face(-8.5, -4.2);
  await G.flyTo(ST.aTable);
  await talk("配送员 · 小郑", "早！今天第一车，交接单上是 <b>6 件</b>。麻烦核对一下件数，签个字。");
  await ask("交接时应该怎么做？", ["当面清点件数，与交接单一致后再签收", "先签字让配送员赶紧走，件数回头再点", "只抽查扫描几件就签收"], 0, { dim: "biz", explain: "交接是责任划分点：<b>当面点清、件数一致再签收</b>。签了字少件就是驿站的责任。" });
  const cnt = await form(`<div class="qt">清点平板车上的快件：一共几件？</div><input type="number" name="n" min="0" max="20" placeholder="件数">`, "确认件数", (v) => (v.n === "" ? "请填写件数" : ""));
  const okCnt = +cnt.n === 6;
  score.rec("biz", okCnt, "交接清点件数");
  toast(okCnt ? "✔ 6 件，与交接单一致" : `✘ 车上是 6 件（你填了 ${cnt.n}）`, okCnt ? "ok" : "bad");
  await talk("配送员 · 小郑", "好嘞，签好了。有问题件记得在系统里登记，我下午来揽收。");
  courier.walk([[-8.6, -7.6], [-8.9, -8.6], [-8.9, -11.2]]).then(() => G.despawn(courier));
  stepOk(1);

  // 逐件扫码验收
  stepOn(2);
  const orderIds = ["P1", "P2", "P5", "P3", "P6", "P4"];
  let n = 0;
  for (const id of orderIds) {
    n++;
    const m = PM[id], p = m.userData.parcel;
    await G.flyTo(ST.aTable, 0.5);
    device.hide();
    panel.instr(`第 <b>${n}/6</b> 件：点击右边平板车上的包裹，放到入库台上。`);
    await G.clickOn(m);
    toScene(m);
    await move(m, onTable(m), new Q(), 0.8, 0.3);
    await G.flyTo(ST.aScan, 0.5);
    const scanned = await scanInbound(p, m);
    const looksOk = await inspect(m, p);
    const isExc = !scanned || !looksOk;
    if (isExc) {
      const type = !scanned ? "面单模糊" : "外包装破损";
      const r = await pdaRun(`<div class="warnbox">异常挑出登记</div>${scanned ? infoTable(p) : "单号：<b>无法识别</b>"}<div style="margin-top:6px">异常类型
        <select name="t"><option>外包装破损</option><option>面单模糊</option><option>水湿</option><option>地址不详</option></select></div>`, [{ act: "ok", label: "登记并挑出", cls: "primary wide" }], { bar: "到件入库 · 异常" });
      score.rec("dev", r.v.t === type, `PDA 异常登记类型（应为“${type}”）`);
      if (r.v.t !== type) toast(`异常类型应登记为“${type}”`, "bad");
      beep(true);
      state.inbound.exc.push(id);
      await move(m, cratePos(m, state.inbound.exc.length - 1), null, 0.8, 0.35);
      toast("已挑出，放入<b>异常件周转筐</b>", "", 2000);
    } else {
      await pdaRun(`<div class="ok">✔ 扫描成功，请核对</div>${infoTable(p)}`, [{ act: "ok", label: "确认入库", cls: "primary wide" }], { bar: "到件入库" });
      beep(true);
      state.inbound.ok.push(id);
      G.pdaDraw(["#入库成功", p.no, `待上架 ${state.inbound.ok.length} 件`]);
      await move(m, cartPos(m, state.inbound.ok.length - 1), new Q(), 1.0, 0.5);
    }
  }
  stepOk(2);

  // 批次确认
  stepOn(3);
  panel.instr("全部 6 件处理完。在 PDA 上做<b>批次确认</b>：填入入库件数和异常件数。");
  let tries = 0;
  for (;;) {
    const r = await pdaRun(`<div class="big">批次确认</div>应到：<b>6</b> 件<br>正常入库<input type="number" name="a" min="0" max="6"> 件<br>异常挑出<input type="number" name="b" min="0" max="6"> 件`, [{ act: "ok", label: "提交批次", cls: "primary wide" }], { bar: "到件入库 · 批次" });
    const good = +r.v.a === state.inbound.ok.length && +r.v.b === state.inbound.exc.length;
    if (tries === 0) score.rec("dev", good, "批次确认件数");
    if (good) break;
    tries++; beep(false);
    toast(`件数对不上：系统记录正常 ${state.inbound.ok.length} 件、异常 ${state.inbound.exc.length} 件，合计应等于到件 6 件`, "bad", 4200);
  }
  beep(true);
  G.pdaDraw(["#批次已确认", `入库 ${state.inbound.ok.length} · 异常 ${state.inbound.exc.length}`]);
  device.hide();
  await ask("挑出来的异常件接下来怎么办？", ["在系统中登记后移交 E 问题件暂存区，由异常处理员跟进", "先塞到货架角落，有空再说", "直接退回给配送员带走"], 0, { dim: "exc", explain: "异常件<b>当日登记、集中暂存</b>到 E 区，不能混进货架，也不能私自退回。" });
  W.roller.target = 0; W.van.target = 0;
  G.holdPDA(false);
  stepOk(3);
  await talk(MENTOR, "入库完成！正常件在<b>待上架笼车</b>里，接下来按规则上架。");
  finish();
}
// PDA 功能菜单
async function pdaMenu(want, why) {
  let first = true;
  for (;;) {
    const r = await pdaRun(`<div class="big">请选择作业功能</div>`, ["到件入库", "上架", "出库核销", "问题件登记", "综合查询"].map((f) => ({ act: f, label: f, cls: "wide" })), { bar: "主菜单" });
    if (r.act === want) { if (first) score.rec("dev", true, "PDA 选择作业功能"); beep(true); device.hide(); return; }
    if (first) score.rec("dev", false, `PDA 功能选错（应选“${want}”）`);
    first = false; beep(false); toast(why, "bad", 3500);
  }
}
// 入库扫描：返回是否识别成功
async function scanInbound(p, m) {
  // 第一次：练习扫描距离
  if (!state.distLearned) {
    panel.instr("PDA 扫描：拖动滑块调整<b>枪头到条码的距离</b>，再按黄色<b>扫描键</b>。<span class=\"tip\">说明书：保持 10～20 cm。</span>");
    let firstTry = true;
    for (;;) {
      const d = device.show("pda", "PDA（巴枪）", `<div>枪头距条码：<b id="dv">30</b> cm</div><input class="slider" type="range" name="dist" min="2" max="40" value="30">
        <div class="meter"><i style="left:${(8 / 38) * 100}%;width:${(10 / 38) * 100}%"></i><b id="dm" style="left:${(28 / 38) * 100}%"></b></div><div style="font-size:12px;color:#5b6676;margin-top:4px">绿色区域为有效识读距离</div>`, [{ act: "scan", label: "扫 描", cls: "primary wide" }], pdaOpt);
      const sl = d.querySelector("[name=dist]");
      sl.oninput = () => { d.querySelector("#dv").textContent = sl.value; d.querySelector("#dm").style.left = ((sl.value - 2) / 38) * 100 + "%"; W.dev.pda.g.position.z = -0.3 - (sl.value - 15) * 0.004; };
      const r = await device.wait();
      const v = +r.v.dist;
      W.dev.pda.g.position.z = -0.34;
      const ok = v >= 10 && v <= 20;
      await G.scanFx(ok);
      if (firstTry) score.rec("dev", ok, "PDA 扫描距离");
      if (ok) break;
      firstTry = false;
      toast(v < 10 ? "✘ 太近了，条码超出视场，未识别" : "✘ 太远了，激光太散，未识别", "bad");
    }
    state.distLearned = true;
  } else {
    panel.instr("对准面单条码，按 PDA 的<b>扫描键</b>。");
    await pdaRun(`<div>请扫描面单条码</div><div style="font-size:12px;color:#5b6676">第 ${["P1", "P2", "P5", "P3", "P6", "P4"].indexOf(p.id) + 1} 件</div>`, [{ act: "scan", label: "扫 描", cls: "primary wide" }]);
    await G.scanFx(p.label === "ok");
  }
  if (p.label === "ok") { G.pdaDraw(["#扫描成功", p.no, p.name]); return true; }
  // 条码褶皱：换角度可以识别
  if (p.label === "wrinkle") {
    panel.instr("“嘟嘟”——<b>未识别</b>。仔细看看面单条码。");
    G.pdaDraw(["!未识别", "条码反光/褶皱？"]);
    const r = await pdaRun(`<div class="errbox">未识别到条码</div>请选择处理方式：`, [{ act: "angle", label: "换个角度/压平后重扫", cls: "wide" }, { act: "manual", label: "手工录入单号", cls: "wide" }, { act: "exc", label: "直接挑出为问题件", cls: "wide" }], pdaOpt);
    score.rec("dev", r.act === "angle", "条码褶皱时应先换角度重扫");
    if (r.act !== "angle") toast(r.act === "manual" ? "条码只是褶皱反光，先压平、换角度重扫；手工录入是最后手段，容易输错" : "条码褶皱不算问题件，换个角度就能扫出来", "bad", 4200);
    await rotY(m, 0.35);
    await G.scanFx(true);
    G.pdaDraw(["#扫描成功", p.no, p.name]);
    toast("✔ 换角度后识别成功", "ok");
    return true;
  }
  // 面单模糊：重扫失败 → 手工录入也看不清 → 挑出
  G.pdaDraw(["!未识别"]);
  panel.instr("“嘟嘟”——<b>未识别</b>。面单好像受潮磨损了。");
  let tried = false;
  for (;;) {
    const r = await pdaRun(`<div class="errbox">未识别到条码</div>请选择处理方式：`, [{ act: "angle", label: "换个角度重扫", cls: "wide" }, { act: "manual", label: "手工录入单号", cls: "wide" }, { act: "exc", label: "挑出为问题件", cls: "wide" }], pdaOpt);
    if (r.act === "angle") { await rotY(m, 0.4); await G.scanFx(false); toast("换了角度还是识别不了", "bad"); tried = true; continue; }
    if (r.act === "manual") {
      const r2 = await pdaRun(`手工录入单号（看面单上的数字）：<input type="text" name="no" placeholder="例如 YT 1234 5678 9012">`, [{ act: "ok", label: "查询", cls: "primary wide" }], pdaOpt);
      beep(false); toast(`系统查无单号“${esc(r2.v.no || "空")}”——面单数字缺失，无法确认`, "bad", 3500);
      tried = true; continue;
    }
    score.rec("exc", tried, "面单模糊件：先多角度重扫/手工录入，仍不行再挑出");
    if (!tried) toast("应先多角度重扫、尝试手工录入，确实无法识别再挑出", "bad", 3800);
    else toast("✔ 处置正确：重扫和手工录入都不行 → 挑出登记", "ok");
    return false;
  }
}
// 外观验收：返回是否完好
async function inspect(m, p) {
  panel.instr("<b>外观验收</b>：用按钮转动包裹，检查四周有没有<b>破损、水湿、变形</b>。");
  device.hide();
  for (;;) {
    const v = await btnWait([{ label: "⟲ 转动 90°", v: "r" }, { label: "检查完毕", primary: true, v: "ok" }]);
    if (v === "r") { await rotY(m); continue; }
    break;
  }
  const truth = p.dmg === "torn" ? 1 : 0;
  const r = await ask("这件快件的外包装：", ["完好，验收通过", "破损（压塌、破洞）", "水湿", "变形"], truth, { dim: "biz", keepOrder: true, err: `外观验收判断（${p.id}）`, explain: truth ? "背面有破洞、一角被压塌——属于<b>破损件</b>，必须挑出，拍照留证后交问题件区处理。" : "" });
  if (!r.ok && truth) toast("导师提醒：这件背面破了，按破损件挑出", "bad");
  return !truth;
}

// ============ 分拣上架 ============
async function taskShelf() {
  begin("shelf");
  ensureInbound();
  G.mentor.at(-3.2, -1.6, PI);
  stepOn(0);
  await G.goto(ST.bCart, "前往<b>待上架笼车</b>（A 区和货架区之间）");
  await talk(MENTOR, "上架有三条铁律：<b>按规则分区、面单朝外、同一收件人合并</b>。规则贴在货架区墙上，PDA 里也能看。");
  if (!G.holding) G.holdPDA(true);
  await pdaMenu("上架", "现在要把待上架的件放上货架，选“上架”。");
  stepOk(0);

  stepOn(1);
  const list = ["P1", "P2", "P3", "P4"].filter((id) => PM[id] && !PM[id].userData.parcel.code);
  for (const id of list) {
    const m = PM[id], p = m.userData.parcel;
    await G.goto(ST.bCart, "回到<b>待上架笼车</b>拿下一件");
    panel.instr("点击笼车里的一件包裹，扫描后上架。");
    await G.clickOn(m);
    await carry(m);
    await pdaRun(`请扫描包裹面单`, [{ act: "scan", label: "扫 描", cls: "primary wide" }], { bar: "上架" });
    await G.scanFx(true);
    G.pdaDraw(["#" + p.name, p.addr.replace("本校 ", "")]);
    const rules = SHELF_RULES.map((r) => `<li>${r}</li>`).join("");
    device.show("pda", "PDA（巴枪）", `${infoTable(p)}<details style="margin-top:4px"><summary>查看上架规则</summary><ol style="padding-left:16px;margin:4px 0">${rules}</ol></details>`, [], { bar: "上架 · 待分区" });
    const want = ruleShelf(p);
    const opts = ["1 号架（宿舍 1～4 栋）", "2 号架（宿舍 5～8 栋）", "3 号架（宿舍 9～12 栋）", "4 号架（教职工）", "5 号大件区"];
    await ask(`这件应该放到哪个货架？`, opts, want - 1, { dim: "biz", keepOrder: true, err: `上架分区（${p.name}）`, explain: (i, ok) => (ok ? "" : `按规则应放 <b>${opts[want - 1]}</b>：${p.big ? "重 " + p.kg + " kg、最长边 " + Math.round(Math.max(...p.size) * 100) + " cm，属于大件" : p.staff ? "收件人是教职工" : "收件人住 " + p.bld + " 栋"}。`) });
    let [s, l, k] = SHELF_SLOT[id];
    let offset = 0;
    if (id === "P4") {
      device.show("pda", "PDA（巴枪）", `<div class="warnbox">该收件人（刘*婷 尾号3367）已有 <b>1 件在库</b>：1-2-0603（1 号架 2 层 第 2 格）</div>是否合并存放？`, [], { bar: "上架 · 合并提示" });
      await ask("系统提示同一收件人已有在库件，怎么放？", ["合并存放到 1 号架 2 层第 2 格，和她的另一件放在一起", "另找一个空位分开放"], 0, { dim: "biz", keepOrder: true, explain: "同一收件人<b>合并存放</b>：取件时一次找齐，不会漏拿。" });
      offset = 0.15;
    } else {
      device.show("pda", "PDA（巴枪）", `<div class="ok">系统推荐库位</div><div class="big">${s} 号${s === 5 ? "大件区" : "架"} ${s === 5 ? "" : l + " 层 "}第 ${k} ${s === 5 ? "位" : "格"}</div>`, [], { bar: "上架 · 推荐库位" });
    }
    const pose = slotPose(s, l, k);
    await G.goto(pose, `把包裹送到 <b>${s} 号${s === 5 ? "大件区" : "架"} ${s === 5 ? "" : l + " 层"} 第 ${k} ${s === 5 ? "位" : "格"}</b>`);
    await ask("放上去的时候，面单朝哪边？", ["面单朝外（朝向通道）", "面单朝里（朝向货架背板）"], 0, { dim: "biz", keepOrder: true, silent: true, err: "面单朝外", explain: (i, ok) => (ok ? "" : "面单朝里，取件时就得把包裹一件件翻出来看，又慢又容易拿错。") });
    if (p.fragile) await ask("这件贴着“易碎”标识，放置时要注意：", ["单独平放，不要叠压，也不要压在别的包裹下面", "塞紧一点，上面再压几件小包裹省空间"], 0, { dim: "biz", keepOrder: true, explain: "易碎件单独平放、不得叠压。" });
    await shelve(m, s, l, k, offset);
    const code = newCode(s, l);
    m.userData.setCode(code);
    await G.scanFx(true);
    device.show("pda", "PDA（巴枪）", `<div class="ok">✔ 上架成功</div>取件码：<div class="big">${code}</div>已短信通知 ${p.name}（${p.phone}）`, [], { bar: "上架" });
    G.pdaDraw(["#上架成功", "取件码 " + code]);
    toast(`上架成功，取件码 <b>${code}</b>，系统已发送取件通知`, "ok");
    await G.wait(900);
  }
  stepOk(1);

  stepOn(2);
  device.hide();
  G.release();
  await talk(MENTOR, "上架完了，再<b>巡检一遍货架区</b>：有没有掉在通道上的件、面单朝里的件？发现了就点它处理。");
  const fallen = PM.S5, inward = PM.S4;
  const found = new Set();
  let wrongClicks = 0;
  const t0 = performance.now();
  const refresh = () => panel.instr(`巡检货架区：找出 <b>2 处不规范</b>并处理（已发现 ${found.size}/2）。<span class="tip">走到货架之间仔细看；点在库包裹可以看到它的取件码。</span>`);
  refresh();
  panel.btns([{ label: "我找不到，给点提示", fn: () => { [fallen, inward].forEach((o) => !found.has(o) && G.hl(o, true)); toast("发光的就是"); } }]);
  while (found.size < 2) {
    const r = await G.clickOn([fallen, inward].filter((o) => !found.has(o)), { hl: false, onOther: (h) => { if (h.filler) { wrongClicks++; toast(`${h.filler.code}：摆放正常`); return true; } return false; } });
    const o = r.target;
    found.add(o); G.hl(o, false);
    if (o === fallen) {
      await G.goto({ name: "掉落的包裹", stand: [2.0, -5.3], eye: [2.0, 1.45, -5.2], look: [2.0, 0.1, -6.05] });
      await ask("通道上掉了一件包裹（取件码 3-1-0412），怎么处理？", ["按取件码放回 3 号架 1 层，并检查外包装", "先放到入库台上，等有空再处理", "放到最近的货架空位上就行"], 0, { dim: "biz", keepOrder: true, explain: "通道要保持畅通；掉落件按取件码<b>归位</b>，否则顾客来取时系统显示在库却找不到。" });
      await shelve(fallen, 3, 1, 4);
    } else {
      await G.goto({ name: "3 号架", ...slotPose(3, 2, 1) });
      await ask("这件包裹朝外的一面看不到面单，怎么办？", ["转过来，让面单朝外", "不用管，系统里有库位就行"], 0, { dim: "biz", keepOrder: true, explain: "面单朝外才能一眼核对取件码。" });
      await shelve(inward, 3, 2, 1, 0, false);
    }
    G.release();
    refresh();
  }
  panel.btns([]);
  score.rec("biz", (performance.now() - t0) / 1000 < 150 && wrongClicks < 6, "库内巡检效率");
  stepOk(2);
  G.holdPDA(false);
  await talk(MENTOR, "货架整整齐齐。中午下课后是<b>取件高峰</b>，去 C 出库服务台。");
  finish();
}

// ============ 客户服务与出库 ============
function ensureShelved() {
  ensureInbound();
  for (const id of ["P1", "P2", "P3", "P4"]) {
    const m = PM[id];
    if (m.userData.parcel.code) continue;
    const [s, l, k] = SHELF_SLOT[id];
    toScene(m); placeShelfNow(m, s, l, k, id === "P4" ? 0.15 : 0);
    m.userData.setCode(newCode(s, l));
  }
  for (const [m, s, l, k] of [[PM.S5, 3, 1, 4], [PM.S4, 3, 2, 1]]) placeShelfNow(m, s, l, k);
}
async function taskOut() {
  begin("out");
  ensureShelved();
  G.mentor.at(10.6, 6.6, -PI / 2);
  // ---- ① 终端取件出库 ----
  stepOn(0);
  await G.goto(ST.cKiosk, "前往门口的<b>自助出库终端</b>");
  const zhou = G.spawn("zhou", 0, 13.5, PI, "周同学");
  await npcGo(zhou, 6.05, 6.55); zhou.face(6.8, 7.3);
  await talk("顾客 · 周同学", "你好，我取个快递，取件码是 <b>2-3-0618</b>。");
  let first = true;
  for (;;) {
    panel.instr("在终端上输入顾客报的<b>取件码</b>。");
    screenText(W.dev.kiosk.screen, "自助出库", ["#请输入取件码"]);
    const r = await device.run("kiosk", "自动出库终端", `取件码<input type="text" name="c" placeholder="例如 1-2-0345" autocomplete="off">${padHtml("[name=c]")}`, [{ act: "q", label: "查 询", cls: "primary wide" }], { bar: "自助出库" });
    const ok = r.v.c.replace(/\s/g, "") === "2-3-0618";
    if (first) score.rec("dev", ok, "终端输入取件码");
    if (ok) break;
    first = false; beep(false); toast(`未查询到“${esc(r.v.c)}”，复核一下取件码`, "bad");
  }
  beep(true);
  screenText(W.dev.kiosk.screen, "查询结果", ["#库位 2 号架 3 层 第 3 格", "收件人 周*宁  尾号 5521", "状态：在库"]);
  device.show("kiosk", "自动出库终端", `<div class="ok">查询成功</div><div class="big">2 号架 · 3 层 · 第 3 格</div>收件人：周*宁　手机尾号 5521<br>状态：在库<div style="font-size:12px;color:#5b6676;margin-top:4px">请到货架取件后回到终端扫描核销</div>`, [], { bar: "自助出库" });
  const pose = slotPose(2, 3, 3);
  await G.goto(pose, "到 <b>2 号架 3 层第 3 格</b> 找到取件码 2-3-0618 的包裹");
  panel.instr("找到贴着取件码 <b>2-3-0618</b> 的包裹并点击它。<span class=\"tip\">这一格附近有好几个相似的码，仔细核对。</span>");
  let wrong = 0;
  await G.clickOn(PM.S1, { hl: false, onOther: (h) => { if (h.filler || h.obj?.userData.parcel) { wrong++; beep(false); toast(`✘ 这件是 ${h.filler ? h.filler.code : h.obj.userData.parcel.code || "其他包裹"}，不是 2-3-0618`, "bad"); return true; } return false; } });
  score.rec("biz", wrong === 0, "按库位找件（取件码核对）");
  await carry(PM.S1);
  await G.goto(ST.cKiosk, "拿着包裹回到<b>自助出库终端</b>");
  await ask("交给顾客前，还要核验什么？", ["请顾客报手机尾号（或出示取件短信），与系统核对", "不用核对，取件码对了就行", "让顾客自己看看是不是他的"], 0, { dim: "biz", keepOrder: true, explain: "取件码可能被别人看到或转发，<b>手机尾号/姓名</b>与系统一致才能交付。" });
  await talk("顾客 · 周同学", "尾号 <b>5521</b>。");
  toast("✔ 与系统一致（周*宁，尾号 5521）", "ok");
  await ask("下一步做什么？", ["在终端扫描包裹条码，完成出库核销，再交给顾客", "先把包裹交给顾客，核销等不忙了再补"], 0, { dim: "dev", keepOrder: true, err: "出库核销顺序", explain: "先核销再交付。漏扫核销会导致系统仍显示“在库”，盘点对不上，顾客还会继续收到催取短信。" });
  await device.run("kiosk", "自动出库终端", `请把包裹条码对准扫描窗`, [{ act: "s", label: "扫描核销", cls: "primary wide" }], { bar: "出库核销" });
  beep(true);
  screenText(W.dev.kiosk.screen, "出库成功", ["#2-3-0618 已出库", "凭条打印中……", "请当面检查外包装"]);
  device.show("kiosk", "自动出库终端", `<div class="ok">✔ 出库核销成功</div>凭条已打印`, [], { bar: "出库核销" });
  toScene(PM.S1); zhou.hold(PM.S1); G.removePick(PM.S1);
  const sv = await talk("（你对周同学说）", "选择交付时的说法：", ["请当面检查一下外包装，没问题就可以带走了。", "拿好，下一位！", "东西坏了可别来找我们啊。"]);
  score.rec("biz", sv === 0, "交付话术：提醒当面检查");
  toast(sv === 0 ? "✔ 服务规范" : "✘ 交付时应提醒顾客当面检查外包装", sv === 0 ? "ok" : "bad");
  await talk("顾客 · 周同学", "好的，包装没问题，谢谢！");
  npcLeave(zhou);
  device.hide();
  stepOk(0);

  // ---- ② 代取身份核验 ----
  stepOn(1);
  await G.goto(ST.cDesk, "到<b>出库服务台</b>员工一侧（绕到柜台后面）");
  const wu = G.spawn("wu", 0, 13.5, PI, "吴同学");
  await npcGo(wu, 7.55, 4.0); wu.face(8.6, 4.0);
  await talk("顾客 · 吴同学", "你好，我帮室友<b>刘*婷</b>取快递，她在上课。这是她发我的取件码截图：<b>1-2-0603</b>。");
  await ask("代取怎么处理？", ["请代取人说出收件人姓名和手机尾号，核对一致后登记代取人信息再放件", "有取件码截图就直接放件", "代取一律不给，必须本人来"], 0, { dim: "biz", keepOrder: true, err: "代取身份核验", explain: "代取不是不能取，而是要<b>核验 + 登记</b>：收件人信息对得上，并记下代取人姓名和电话，出了问题可追溯。" });
  await talk("顾客 · 吴同学", "她叫刘*婷，尾号 <b>3367</b>。我叫吴*，电话 139****0021。");
  await G.flyTo(ST.cPC);
  panel.instr("在查询系统里按取件码查询，并<b>登记代取人</b>。");
  screenText(W.dev.monitor.screen, "驿站管理系统 · 查询", ["#取件码 1-2-0603", "收件人 刘*婷 尾号 3367", "在库 2 件（合并存放）"], "#334155");
  const p4code = PM.P4.userData.parcel.code;
  for (;;) {
    const r = await device.run("pc", "驿站管理系统", `<table><tr><th>取件码</th><th>收件人</th><th>库位</th></tr><tr><td>1-2-0603</td><td>刘*婷 3367</td><td>1-2 第2格</td></tr><tr><td>${p4code}</td><td>刘*婷 3367</td><td>1-2 第2格</td></tr></table>
      <div class="warnbox">该收件人有 <b>2 件</b>在库（合并存放），其中 1 件为<b>易碎品</b></div>
      代取人姓名<input type="text" name="n" placeholder="代取人姓名"> 代取人电话<input type="text" name="t" placeholder="电话">`, [{ act: "ok", label: "登记代取", cls: "primary wide" }], { bar: "查询 · 代取登记" });
    if (r.v.n && r.v.t) { score.rec("dev", true, "代取登记"); break; }
    beep(false); toast("代取人姓名和电话都要登记", "bad");
  }
  beep(true);
  device.hide();
  await G.goto(slotPose(1, 2, 2), "到 <b>1 号架 2 层第 2 格</b> 取刘*婷的 2 件包裹");
  panel.instr(`点击两件包裹：<b>1-2-0603</b> 和 <b>${p4code}</b>。`);
  const got = [];
  while (got.length < 2) {
    const r = await G.clickOn([PM.S2, PM.P4].filter((o) => !got.includes(o)), { hl: false, onOther: (h) => { if (h.filler) { beep(false); toast(`这件是 ${h.filler.code}，不是刘*婷的`, "bad"); return true; } return false; } });
    got.push(r.target);
    await carry(r.target, got.length - 1);
  }
  score.rec("biz", true, "合并件一次取齐");
  await G.goto(ST.cDesk, "回到<b>出库服务台</b>");
  await device.run("pc", "驿站管理系统", `代取出库：1-2-0603、${p4code}`, [{ act: "s", label: "扫描核销 2 件", cls: "primary wide" }], { bar: "出库核销" });
  beep(true); device.hide();
  got.forEach((o) => { toScene(o); G.removePick(o); });
  wu.hold(PM.P4); PM.S2.visible = false;
  const sv2 = await talk("（你对吴同学说）", "交付时怎么说？", ["其中一件是易碎的陶瓷杯，请当面检查一下，也提醒室友本人再查收。", "两件都在这，拿走吧。", "易碎的碎了不关我们的事。"]);
  score.rec("biz", sv2 === 0, "交付话术：易碎件提醒");
  toast(sv2 === 0 ? "✔ 服务规范" : "✘ 易碎件要提醒当面检查", sv2 === 0 ? "ok" : "bad");
  npcLeave(wu);
  stepOk(1);

  // ---- ③ 咨询应答 ----
  stepOn(2);
  const sun = G.spawn("sun", 0, 13.5, PI, "孙老师");
  await npcGo(sun, 7.55, 4.0); sun.face(8.6, 4.0);
  await talk("顾客 · 孙老师", "你好，我的快递物流显示<b>昨天就到驿站了</b>，可我一直没收到取件码短信。");
  await ask("怎么处理？", ["请老师提供手机号后四位，在系统里按手机号查询", "让老师回去再等等短信", "告诉老师可能丢了，让他找快递公司"], 0, { dim: "biz", keepOrder: true, err: "咨询应答：按手机号查询", explain: "没收到短信 ≠ 没到件。先<b>按手机号查询在库</b>，再看短信状态。" });
  await talk("顾客 · 孙老师", "尾号 <b>8890</b>。");
  await G.flyTo(ST.cPC);
  for (first = true; ;) {
    screenText(W.dev.monitor.screen, "驿站管理系统 · 查询", ["#按手机尾号查询"], "#334155");
    const r = await device.run("pc", "驿站管理系统", `查询方式：<b>手机尾号</b><input type="text" name="t" placeholder="4 位尾号" maxlength="4">${padHtml("[name=t]", "1234567890")}`, [{ act: "q", label: "查 询", cls: "primary wide" }], { bar: "综合查询" });
    const ok = r.v.t === "8890";
    if (first) score.rec("dev", ok, "按手机尾号查询");
    if (ok) break;
    first = false; beep(false); toast("没有查到，核对一下尾号", "bad");
  }
  beep(true);
  screenText(W.dev.monitor.screen, "驿站管理系统 · 查询", ["#4-1-0907 在库", "孙*老师 尾号 8890", "!取件短信：发送失败"], "#334155");
  device.show("pc", "驿站管理系统", `<table><tr><th>取件码</th><th>收件人</th><th>入库时间</th></tr><tr><td><b>4-1-0907</b></td><td>孙*老师 8890</td><td>昨天 16:42</td></tr></table><div class="errbox">取件短信：<b>发送失败</b>（运营商拦截）</div>`, [], { bar: "综合查询" });
  const sv3 = await talk("（你对孙老师说）", "怎么回复？", ["抱歉让您久等了！包裹在 4 号架，短信没发送成功，我马上帮您取，也请您核对一下预留手机号。", "短信发不出去不是我们的问题。", "在 4 号架，您自己去找吧。"]);
  score.rec("biz", sv3 === 0, "咨询应答话术");
  toast(sv3 === 0 ? "✔ 先致歉、给出原因和解决办法" : "✘ 应先致歉、说明原因并主动帮忙", sv3 === 0 ? "ok" : "bad");
  device.hide();
  panel.instr("王师傅帮你把 4-1-0907 取了过来……");
  const s3 = PM.S3; toScene(s3);
  await move(s3, new V3(8.62, 1.07 + half(s3), 5.25), new Q(), 1.2, 0.6);
  await device.run("pc", "驿站管理系统", "4-1-0907 · 孙*老师", [{ act: "s", label: "扫描核销", cls: "primary wide" }], { bar: "出库核销" });
  beep(true); device.hide();
  sun.hold(s3); G.removePick(s3);
  await talk("顾客 · 孙老师", "原来如此，谢谢你！我回头改一下手机号。");
  npcLeave(sun);
  stepOk(2);

  // ---- ④ 智能柜投件 ----
  stepOn(3);
  await talk(MENTOR, "柜台上这件是郑*的，她在 App 里选了<b>柜机自提</b>。拿去门外的智能快递柜投柜。");
  const lp = PM.S6;
  panel.instr("点击柜台上那件包裹拿起来。");
  await G.clickOn(lp);
  await carry(lp);
  await G.goto(ST.locker, "拿着包裹走到<b>门外的智能快递柜</b>");
  const L = W.dev.locker;
  await lockerOp(["投递快件", "取件", "异常处理"], "投递快件", "智能柜投件");
  await device.run("locker", "智能快递柜", `请扫描运单条码`, [{ act: "s", label: "扫描运单", cls: "primary wide" }], { bar: "投递快件" });
  beep(true);
  const lpp = lp.userData.parcel;
  const sizeTxt = lpp.size.map((v) => Math.round(v * 100)).join("×");
  let cell = null;
  for (first = true; ;) {
    const html = `${infoTable(lpp)}<div style="margin-top:4px">包裹 ${sizeTxt} cm，请选择格口：<span style="font-size:11px;color:#5b6676">（红=已占用　黄=门未关；S 高22 · M 高32 · L 高45 cm）</span></div>${lockerGrid(L)}`;
    const d = device.show("locker", "智能快递柜", html, [], { bar: "投递快件 · 选格口" });
    const r = await new Promise((res) => d.querySelectorAll("[data-cell]").forEach((b) => (b.onclick = () => res(+b.dataset.cell))));
    d.querySelectorAll("[data-cell]").forEach((b) => (b.disabled = true));
    const c = L.cells.find((x) => x.n === r);
    let msg = "";
    if (c.occupied) msg = `${c.n} 号格口已有包裹，不能重复投递`;
    else if (c.n === 12) msg = "12 号柜门未关，状态异常，先不要使用";
    else if (c.size === "S") msg = `包裹高 ${Math.round(lpp.size[1] * 100)} cm、宽 ${Math.round(lpp.size[2] * 100)} cm，小格口放不下`;
    if (first) score.rec("dev", !msg, "智能柜选格口");
    if (!msg) { cell = c; break; }
    first = false; beep(false); toast("✘ " + msg, "bad");
  }
  beep(true);
  cell.target = 1;
  screenText(L.screen, "投递快件", [`#${cell.n} 号格口已打开`, "请放入包裹并关好柜门"]);
  panel.instr(`${cell.n} 号格口已弹开。点击<b>格口</b>把包裹放进去。`);
  G.addPick(cell.pivot); cell.pivot.userData.pick = { name: `${cell.n} 号格口` };
  await G.clickOn(cell.pivot);
  toScene(lp);
  const lockerWorld = new V3(); cell.pivot.getWorldPosition(lockerWorld);
  const inside = new V3(L.g.position.x - (cell.x + 0.0), cell.y + half(lp) + 0.01, L.g.position.z - 0.02);
  await move(lp, inside, new Q().setFromEuler(new E(0, PI, 0)), 0.8, 0.15);
  G.removePick(lp);
  panel.instr("点击柜门，把它<b>关严</b>。");
  await G.clickOn(cell.pivot);
  G.removePick(cell.pivot);
  cell.target = 0; cell.occupied = true;
  await G.wait(500);
  beep(true);
  screenText(L.screen, "投递成功", [`#${cell.n} 号格口 投递成功`, "已向收件人发送取件码", "", "⚠ 12 号格口柜门未关"]);
  device.show("locker", "智能快递柜", `<div class="ok">✔ 投递成功</div>${cell.n} 号格口 · 已短信通知 郑*（131****2048）`, [], { bar: "投递快件" });
  stepOk(3);

  // ---- ⑤ 柜门异常 ----
  stepOn(4);
  await G.wait(700);
  beep(false);
  toast("⚠ 柜机报警：12 号格口柜门未关闭", "bad", 3500);
  const c12 = L.cells.find((c) => c.n === 12);
  device.show("locker", "智能快递柜", `<div class="errbox">⚠ 12 号格口柜门未关闭（已持续 18 分钟）</div>上一位顾客取件后没有关门。`, [], { bar: "异常提醒" });
  await ask("怎么处理？", ["先看格口里还有没有物品：空的就关严柜门，在柜机上确认处理；有物品则联系收件人确认后再关门", "不用管，等它自己不报警", "给柜机断电重启"], 0, { dim: "exc", keepOrder: true, err: "柜门未关异常", explain: "柜门未关会导致格口无法再用、包裹可能丢失。先<b>查看格口内情况</b>，再关门并在系统里<b>解除异常</b>。" });
  panel.instr("12 号格口里是空的。点击 <b>12 号柜门</b>把它关严。");
  G.addPick(c12.pivot); c12.pivot.userData.pick = { name: "12 号格口（柜门未关）" };
  await G.clickOn(c12.pivot);
  G.removePick(c12.pivot);
  c12.target = 0;
  await G.wait(400);
  await lockerOp(["投递快件", "取件", "异常处理"], "异常处理", "柜机异常解除");
  beep(true);
  device.show("locker", "智能快递柜", `<div class="ok">✔ 12 号格口异常已解除</div>柜门状态：关闭`, [], { bar: "异常处理" });
  lockerIdle(); screenText(L.screen, "智能快递柜", ["#取件请输入取件码", "设备状态正常"]);
  stepOk(4);
  await talk(MENTOR, "高峰顺利过去了！下午学生寄件多，去 <b>D 寄件处理区</b>。");
  finish();
}
async function lockerOp(opts, want, what) {
  let first = true;
  for (;;) {
    const r = await device.run("locker", "智能快递柜", `<div class="big">驿站员模式</div>工号 ${WORKER_ID} 已登录`, opts.map((o) => ({ act: o, label: o, cls: "wide" })), { bar: "智能快递柜" });
    if (r.act === want) { if (first) score.rec("dev", true, what); device.hide(); return; }
    if (first) score.rec("dev", false, what + `（应选“${want}”）`);
    first = false; beep(false); toast(`现在要做的是“${want}”`, "bad");
  }
}
function lockerGrid(L) {
  const cols = [[], [], [], [], []];
  L.cells.forEach((c) => { const ci = Math.round((c.x + 1.2) / 0.6); cols[ci].push(c); });
  const hpx = { S: 22, M: 32, L: 45 };
  return `<div class="lockgrid">${cols.map((col, ci) => `<div class="col">${col.map((c) => `<button data-cell="${c.n}" class="${c.occupied ? "occ" : c.n === 12 ? "ajar" : ""}" style="height:${hpx[c.size]}px">${c.n}·${c.size}</button>`).join("")}${ci === 2 ? '<div class="scrcell">主屏</div>' : ""}</div>`).join("")}</div>`;
}

// ============ 寄件处理 ============
async function taskSend() {
  begin("send");
  G.mentor.at(-6.2, 2.2, -PI * 0.6);
  stepOn(0);
  await G.goto(ST.dCounter, "前往 <b>D 寄件处理区</b>，站到寄件柜台后面");
  const lin = G.spawn("lin", 0, 13.5, PI, "林同学");
  await npcGo(lin, -7.55, 4.6); lin.face(-8.4, 4.6);
  await talk("顾客 · 林同学", "你好，我想寄一箱东西回家，寄到<b>浙江杭州</b>。");
  await ask("收寄的第一步是？", ["查验寄件人有效身份证件，做实名登记", "直接让她填单", "先称重算运费"], 0, { dim: "biz", keepOrder: true, err: "寄件实名", explain: "寄递实行<b>实名收寄</b>：先核验身份证件并登记，再验视、包装、称重。" });
  await talk("顾客 · 林同学", "好的，这是我的身份证。");
  await device.run("plain", "寄件系统 · 实名登记", `证件类型：居民身份证<br>姓名：林*然<br>证件号：3301**********2046<br><span style="font-size:12px;color:#5b6676">核对证件照片与本人一致</span>`, [{ act: "ok", label: "核验一致，登记", cls: "primary wide" }], { bar: "实名登记" });
  beep(true); device.hide();
  stepOk(0);

  // 开箱验视
  stepOn(1);
  await talk("顾客 · 林同学", "要寄的是这些：几本书、一件外套，还有……这个打火机也一起放进去吧。");
  const items = sendItems();
  panel.instr("按规定<b>当面逐件验视</b>：依次点击柜台上的每件物品，判断能否寄递。");
  const remaining = new Set(items.map((x) => x.mesh));
  while (remaining.size) {
    const r = await G.clickOn([...remaining]);
    const it = items.find((x) => x.mesh === r.target);
    remaining.delete(r.target);
    await ask(`<b>${it.name}</b>：能否寄递？`, ["可以寄递", "禁止寄递"], it.ban ? 1 : 0, { dim: "exc", keepOrder: true, err: `验视判定：${it.name}`, explain: it.ban ? "打火机属于<b>易燃易爆</b>物品，列入《禁止寄递物品指导目录》，不能收寄。" : "" });
  }
  const sv = await talk("（你对林同学说）", "怎么跟她说打火机的事？", ["按规定打火机属于禁寄物品，不能寄，麻烦您自己带回处理；其他东西都可以正常寄。", "没事，塞箱子里查不出来的。", "有打火机的话整箱都不能寄了。"]);
  score.rec("exc", sv === 0, "拒寄话术");
  toast(sv === 0 ? "✔ 依法拒收并说明原因" : "✘ 应依法拒收禁寄物品、说明原因，其他物品正常收寄", sv === 0 ? "ok" : "bad");
  const lighter = items.find((x) => x.ban).mesh;
  await move(lighter, new V3(-7.95, 1.07 + 0.04, 4.0), null, 0.6, 0.15);
  lin.hold(lighter); G.removePick(lighter);
  stepOk(1);

  // 规范包装
  stepOn(2);
  await G.flyTo(ST.dTable);
  await ask("书 3 本（约 26×19×10 cm）+ 一件外套，选哪个纸箱？", ["小号箱 30×20×15 cm", "中号箱 40×30×25 cm", "大号箱 60×40×40 cm"], 1, { dim: "biz", keepOrder: true, err: "纸箱选择", explain: (i) => (i === 0 ? "小号箱装不下外套。" : i === 2 ? "大号箱空隙大、缓冲难做；体积重 60×40×40÷6000 = <b>16 kg</b>，运费会贵很多。" : "中号箱刚好，体积重 40×30×25÷6000 = 5 kg。") });
  const box = mk({ id: "BOX", c: "yt", no: "YT 7731 5806 2219", name: "林*然", phone: "158****6672", addr: "浙江省杭州市西湖区 ×× 路 88 号", from: "本校 校园驿站 林*然", kg: 5.62, size: [0.4, 0.25, 0.3], goods: "书籍、衣物", noLabel: true });
  box.position.set(-11.4, 0.86 + 0.125, 4.55); box.rotation.y = PI / 2;
  G.removePick(box);
  for (const it of items.filter((x) => !x.ban)) { await move(it.mesh, new V3(-11.4, 1.0, 4.55), null, 0.7, 0.4); it.mesh.visible = false; G.removePick(it.mesh); }
  await ask("装箱时怎么做缓冲？", ["箱底和空隙填充气泡膜/纸团，书本竖放塞紧，摇晃不松动", "不用填充，书很结实"], 0, { dim: "biz", keepOrder: true, err: "缓冲填充", explain: "运输中会颠簸、堆压，空隙不填满容易压塌、磨损。" });
  await ask("封箱用哪种方式？", ["“工”字形封箱：中缝一道，两端各一道", "只在中缝贴一条胶带"], 0, { dim: "biz", keepOrder: true, err: "封箱方式", explain: "“工”字形封箱最牢固，两端的缝也封住，不会在搬运中开口。" });
  // 封箱动画：胶带枪划过
  const tg = W.dev.sealer, tp0 = tg.position.clone(), tq0 = tg.quaternion.clone();
  await G.tween(1.2, (k) => { tg.position.set(-11.4, 1.14, 4.35 + k * 0.42); tg.rotation.set(0, PI, 0); });
  tg.position.copy(tp0); tg.quaternion.copy(tq0);
  stepOk(2);

  // 称重计费
  stepOn(3);
  panel.instr("点击纸箱，把它放到<b>电子秤</b>上。");
  G.addPick(box);
  await G.clickOn(box);
  G.removePick(box);
  await move(box, new V3(-11.45, 0.86 + 0.062 + 0.125, 3.75), null, 0.7, 0.2);
  const sc = W.dev.scale;
  let stable = false;
  const readings = [3.9, 6.8, 5.2, 5.9, 5.48, 5.71, 5.58, 5.64, 5.61, 5.62];
  (async () => { for (const v of readings) { sc.set(v, false); await G.wait(230); } sc.set(5.62, true); stable = true; })();
  let early = false;
  for (;;) {
    const d = device.show("plain", "电子秤", `读数：<span class="big" id="rd">--</span> kg <span id="st"></span>`, [{ act: "rec", label: "记录读数", cls: "primary wide" }], { bar: "称重" });
    const iv = setInterval(() => { const a = d.querySelector("#rd"), b = d.querySelector("#st"); if (a) a.textContent = sc.value.toFixed(2); if (b) b.innerHTML = sc.stable ? '<span class="ok">STABLE</span>' : '<span style="color:#d97706">读数跳动中…</span>'; }, 80);
    await device.wait(); clearInterval(iv);
    if (stable) break;
    if (!early) score.rec("dev", false, "读数未稳定就记录");
    early = true; beep(false); toast("✘ 读数还在跳动，等显示 STABLE 再记录", "bad");
  }
  if (!early) score.rec("dev", true, "称重：等读数稳定再记录");
  beep(true); device.hide();
  toast("记录实重 5.62 kg", "ok");
  await ask("实重 5.62 kg；中号箱体积重 40×30×25÷6000 = 5.0 kg。<b>计费重量</b>是？", ["6 kg（取实重和体积重中较大的，不足 1 kg 按 1 kg 计）", "5 kg（按体积重）", "5.62 kg（按实重，不取整）"], 0, { dim: "biz", keepOrder: true, err: "计费重量", explain: "计费重量 = max(实重, 体积重) 再向上取整：max(5.62, 5.0) → <b>6 kg</b>。" });
  await ask("按本站价目（首重 1 kg 10 元，续重 3 元/kg），运费是？", ["10 + 3×5 = 25 元", "10 + 3×6 = 28 元", "6×3 = 18 元"], 0, { dim: "biz", keepOrder: true, err: "运费计算", explain: "6 kg = 首重 1 kg + 续重 5 kg → 10 + 3×5 = <b>25 元</b>。" });
  stepOk(3);

  // 打印面单与贴单
  stepOn(4);
  panel.instr("面单打印中……");
  const pr = W.dev.printer;
  const drawLabel = (faded) => {
    const g = pr.labelCanvas.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 256, 320);
    g.save(); g.translate(0, 0);
    // 打印机的面单是竖着出纸的，横版面单旋转后画
    g.translate(256, 0); g.rotate(PI / 2);
    printWaybill(g, 4, 4, 312, 248, box.userData.parcel);
    g.restore();
    if (faded) { g.fillStyle = "rgba(255,255,255,.62)"; g.fillRect(0, 0, 256, 320); g.fillStyle = "rgba(255,255,255,.9)"; for (let x = 20; x < 256; x += 37) g.fillRect(x, 0, 6, 320); }
    pr.labelTex.needsUpdate = true;
  };
  const printOut = async () => { pr.label.visible = true; await G.tween(1.4, (k) => (pr.label.scale.z = Math.max(0.001, k))); };
  drawLabel(true); await printOut();
  await G.flyTo({ eye: [-10.9, 1.25, 5.62], look: [-11.5, 0.92, 5.62] }, 0.6);
  await ask("看看打出来的面单：", ["字迹浅淡、条码有白色缺行——检查热敏纸方向和打印头后重新打印", "大概能看清，直接贴上去"], 0, { dim: "dev", keepOrder: true, err: "面单打印质量检查", explain: "条码缺行，后面每个环节都扫不出来，只能人工录入，容易出错。<b>打印不清必须重打</b>。" });
  pr.label.scale.z = 0.001; drawLabel(false); await printOut();
  toast("重新打印：条码清晰、无缺行", "ok");
  await G.flyTo(ST.dTable);
  // 贴单位置：三个候选
  box.position.set(-11.45, 0.86 + 0.125, 4.55);
  const spots = [
    { n: "箱子顶面平整处（避开封箱胶带）", ok: true, pos: [-11.363, 0.86 + 0.252, 4.55], rot: [-PI / 2, 0, PI / 2], size: [0.16, 0.12] },
    { n: "压在中缝封箱胶带上", ok: false, pos: [-11.45, 0.86 + 0.253, 4.62], rot: [-PI / 2, 0, PI / 2], size: [0.16, 0.12] },
    { n: "折过箱子的棱角", ok: false, pos: [-11.298, 0.86 + 0.205, 4.42], rot: [0, PI / 2, 0], size: [0.16, 0.12] },
  ];
  const spotMeshes = spots.map((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...s.size), new THREE.MeshBasicMaterial({ color: "#2f6fed", transparent: true, opacity: 0.35, depthWrite: false }));
    m.position.set(...s.pos); m.rotation.set(...s.rot); m.userData.pick = { name: "贴单位置：" + s.n }; m.userData.spot = s;
    G.scene.add(m); G.addPick(m); return m;
  });
  panel.instr("面单该贴在哪里？点击纸箱上的一个<b>蓝色候选位置</b>。");
  const sr = await G.clickOn(spotMeshes, { hl: false });
  const sp = sr.target.userData.spot;
  score.rec("biz", sp.ok, "贴单位置");
  toast(sp.ok ? "✔ 贴在最大的平整面，不压封口、不折角" : `✘ “${sp.n}”不行：${sp.n.includes("胶带") ? "开箱划开胶带会把面单割破，也可能被认为私拆" : "面单折在棱角上，条码弯曲扫不出来，还容易蹭掉"}`, sp.ok ? "ok" : "bad", 4200);
  spotMeshes.forEach((m) => { G.scene.remove(m); G.removePick(m); });
  pr.label.visible = false;
  box.userData.parcel.noLabel = false; box.userData.redraw();
  stepOk(4);

  // 录入与交付
  stepOn(5);
  await G.flyTo(ST.dCounter);
  const bp = box.userData.parcel;
  await device.run("plain", "寄件系统 · 运单确认", `<table><tr><td>寄件人</td><td>林*然（已实名）</td></tr><tr><td>收件地址</td><td>${bp.addr}</td></tr><tr><td>内件</td><td>书籍、衣物（已验视）</td></tr><tr><td>计费重量</td><td>6 kg</td></tr><tr><td>运费</td><td>25 元</td></tr><tr><td>运单号</td><td>${bp.no}</td></tr></table>`, [{ act: "ok", label: "确认下单，生成运单", cls: "primary wide" }], { bar: "系统录入" });
  beep(true); device.hide();
  score.rec("dev", true, "寄件系统录入");
  const sv4 = await talk("（你对林同学说）", "交付时怎么说？", ["已经寄出了，这是运单号，预计 2～3 天到杭州，可以在小程序里查物流。", "好了，你可以走了。"]);
  score.rec("biz", sv4 === 0, "寄件交付话术");
  toast(sv4 === 0 ? "✔ 告知运单号和时效" : "✘ 应告知运单号、预计时效和查询方式", sv4 === 0 ? "ok" : "bad");
  npcLeave(lin);
  const sc0 = W.sendCage.position;
  await move(box, new V3(sc0.x, 0.05 + 0.125, sc0.z), null, 1.0, 0.5);
  stepOk(5);
  await talk(MENTOR, "寄件完成。傍晚之前要把今天的<b>问题件</b>处理掉，去 E 区。");
  finish();
}
// 柜台上的待寄物品
function sendItems() {
  const std = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const list = [];
  const add = (name, ban, build, x, z) => {
    const g = new THREE.Group(); build(g); g.position.set(x, 1.07, z); G.scene.add(g);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.userData.pick = { name }; G.addPick(g); list.push({ name, ban, mesh: g });
  };
  add("书（3 本）", false, (g) => { ["#2d5c8f", "#b33a2f", "#e7c35b"].forEach((c, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.032, 0.19), [std("#f3efe4"), std("#f3efe4"), std(c), std(c), std("#f3efe4"), std(c)]); b.position.y = 0.017 + i * 0.033; b.rotation.y = (i - 1) * 0.08; g.add(b); }); }, -8.35, 3.75);
  add("外套（叠好）", false, (g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.26), std("#4a5d4f", 0.95)); m.position.y = 0.035; g.add(m); const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.06), std("#3d4f42", 0.95)); c.position.set(0, 0.075, -0.1); g.add(c); }, -8.35, 4.55);
  add("打火机", true, (g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.012), std("#d62f2f", 0.3)); b.position.y = 0.035; g.add(b); const t = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.012), new THREE.MeshStandardMaterial({ color: "#d0d4d8", metalness: 0.9, roughness: 0.3 })); t.position.y = 0.079; g.add(t); g.rotation.z = PI / 2; g.position.y += 0.006; }, -8.3, 5.25);
  return list;
}
// 打印机吐出的面单
function printWaybill(g, x, y, w, h, p) {
  drawWaybill(g, x, y, w, h, { ...CARRIERS[p.c], no: p.no, name: p.name, phone: p.phone, addr: p.addr.slice(0, 16), kg: 6, goods: p.goods, from: p.from, seed: 77 });
}

// ============ 问题件处理 ============
function ensureExc() {
  ensureInbound();
  for (const [i, id] of [[1, "P5"], [2, "P6"]]) {
    const m = PM[id]; toScene(m);
    m.position.copy(cageSlot(i)).add(new V3(0, half(m), 0)); m.quaternion.identity();
  }
}
async function taskExc() {
  begin("exc");
  ensureExc();
  G.mentor.at(-8.2, -1.8, -PI / 2);
  await G.goto(ST.eDesk, "前往 <b>E 问题件暂存区</b> 的处理台");
  await talk(MENTOR, "今天有 3 件问题件：早上挑出的<b>破损件</b>、<b>面单模糊件</b>，还有一件昨天留下的<b>地址不详件</b>。按流程处理，台账要当天登记。");
  G.addPick(W.phoneCam); W.phoneCam.userData.pick = { name: "手机（拍照留证）" };
  const TYPES = ["面单模糊", "地址不详", "外包装破损", "水湿", "无头件", "错分件"];
  const cases = [
    { id: "P5", type: 2, step: 0,
      steps: ["拍照留证（外包装、面单、破损处）", "称重，与面单重量核对", "登记问题件台账", "通知收件人，约定当面开箱查验", "上报快递公司（上一环节），跟进理赔"],
      distract: ["自行拆开清点后重新封好", "直接上架，等收件人自己发现"],
      result: "已通知王*浩到站当面开箱查验；同步上报百川速递发起理赔，结果 24 小时内回填台账。" },
    { id: "P6", type: 0, step: 1,
      steps: ["多角度重扫（已尝试，无法识别）", "按可辨认的尾号在系统中查询", "联系快递公司核实收件信息", "补打面单/标签", "正常入库上架并通知收件人"],
      distract: ["按能看清的楼栋猜一个货架先放", "直接退回寄件人"],
      result: "经云通速运核实：单号 YT 7731 9002 5531，收件人周*（7 栋），已补打标签并上架 2 号架，短信已发送。" },
    { id: "Q1", type: 1, step: 2,
      steps: ["系统查询收件人历史收件地址", "按面单电话联系收件人确认地址", "补录完整地址", "正常上架并通知取件", "联系不上则联系寄件人，超期按规定退回"],
      distract: ["不联系任何人，直接退回寄件人", "放到问题件区不管它"],
      result: "电话联系到赵*，确认住 4 栋 216，已补录地址并上架 1 号架，短信已发送。" },
  ];
  const ledger = [];
  for (const cs of cases) {
    stepOn(cs.step);
    const m = PM[cs.id], p = m.userData.parcel;
    panel.instr(`点击问题件暂存笼里的包裹（${p.no.slice(0, 2)} 开头 · ${cs.id === "Q1" ? "灰色快递袋" : "纸箱"}），拿到处理台上。`);
    await G.clickOn(m);
    toScene(m);
    await move(m, new V3(-11.4, 0.76 + half(m), 0.38), new Q().setFromEuler(new E(0, PI / 2, 0)), 0.8, 0.3);
    await G.flyTo({ eye: [-10.6, 1.35, 0.38], look: [-11.4, 0.8, 0.38] }, 0.6);
    for (;;) {
      const v = await btnWait([{ label: "⟲ 转动 90°", v: "r" }, { label: "看清了", primary: true, v: "ok" }]);
      if (v === "r") await rotY(m); else break;
    }
    await ask("这是哪一类问题件？", TYPES, cs.type, { dim: "exc", keepOrder: true, err: `问题件类型判定（${cs.id}）` });
    await order("排出正确的处置步骤：", cs.steps, cs.distract, { dim: "exc", err: `处置路径（${TYPES[cs.type]}）` });
    if (cs.id === "P5") {
      await G.flyTo(ST.eDesk, 0.5);
      panel.instr("先<b>拍照留证</b>：点击台面上的手机，拍下破损处。");
      await G.clickOn(W.phoneCam);
      const fl = new THREE.PointLight("#ffffff", 40, 4); fl.position.set(-10.9, 1.2, 0.3); G.scene.add(fl);
      beep(true); await G.wait(140); G.scene.remove(fl);
      toast("📷 已拍照 3 张：外包装全貌、面单、破损处", "ok");
      score.rec("dev", true, "拍照留证");
    }
    if (cs.id === "Q1") {
      await talk("（电话）收件人 · 赵*", "喂你好……哦，是驿站啊。我住 <b>4 栋 216</b>，地址忘写了，不好意思！");
    }
    if (cs.id === "P6") {
      await talk("（电话）云通速运 客服", "您好，按尾号 5531 和网点信息查到了：单号 <b>YT 7731 9002 5531</b>，收件人周*，本校 7 栋。");
    }
    const lf = await form(`<div class="qt">登记问题件台账</div>
      <table style="width:100%;font-size:13px"><tr><td style="width:70px">单号</td><td>${cs.id === "P6" ? "YT 7731 9002 5531" : p.no}</td></tr>
      <tr><td>类型</td><td><select name="t">${TYPES.map((t) => `<option>${t}</option>`).join("")}</select></td></tr>
      <tr><td>处置</td><td><select name="d"><option value="">请选择</option><option>拍照留证，通知收件人，上报快递公司理赔</option><option>核实信息后补打面单，正常上架</option><option>联系收件人补录地址，正常上架</option><option>直接退回寄件人</option></select></td></tr>
      <tr><td>时限</td><td><select name="l"><option value="">请选择</option><option>当日登记，24 小时内跟进反馈</option><option>一周内处理即可</option></select></td></tr>
      <tr><td>跟进人</td><td><input type="text" name="w" placeholder="你的姓名或工号"></td></tr></table>`, "保存台账", (v) => (!v.d || !v.l || !v.w ? "台账要填完整：处置、时限、跟进人" : ""));
    const wantD = { P5: "拍照留证，通知收件人，上报快递公司理赔", P6: "核实信息后补打面单，正常上架", Q1: "联系收件人补录地址，正常上架" }[cs.id];
    const ledOk = lf.t === TYPES[cs.type] && lf.d === wantD;
    score.rec("exc", ledOk, `台账登记（${cs.id}）`);
    score.rec("exc", lf.l.startsWith("当日"), "问题件时效");
    toast(ledOk ? "✔ 台账已保存" : `台账有误：类型应为“${TYPES[cs.type]}”，处置为“${wantD}”`, ledOk ? "ok" : "bad", 4000);
    ledger.push(cs);
    W.dev.laptop.screen.draw((g, w, h) => {
      g.fillStyle = "#f4f6f9"; g.fillRect(0, 0, w, h); g.fillStyle = "#dc2626"; g.fillRect(0, 0, w, 40); g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.fillText("问题件台账系统", 14, 27);
      g.fillStyle = "#334"; g.font = "16px sans-serif";
      ledger.forEach((c, i) => { g.fillStyle = i % 2 ? "#e9edf3" : "#fff"; g.fillRect(8, 56 + i * 40, w - 16, 38); g.fillStyle = "#223"; g.fillText(`${PM[c.id].userData.parcel.no.slice(0, 7)}…  ${TYPES[c.type]}  已处置  ${WORKER_ID}`, 16, 80 + i * 40); });
    });
    panel.instr(`<b>处置结果：</b>${cs.result}`);
    if (cs.id === "P5") { await move(m, cageSlot(3).add(new V3(0, half(m), 0)), null, 0.8, 0.3); }
    else {
      if (cs.id === "P6") { p.no = "YT 7731 9002 5531"; p.name = "周*"; p.phone = "138****7710"; p.addr = "本校 7 栋 330 室"; p.label = "ok"; }
      else { p.addr = "本校 4 栋 216 室"; }
      const [s, l, k] = SHELF_SLOT[cs.id];
      await shelve(m, s, l, k);
      m.userData.redraw(); m.userData.setCode(newCode(s, l));
    }
    await btnWait([{ label: "下一件 ▶", primary: true }]);
    await G.flyTo(ST.eDesk, 0.5);
    stepOk(cs.step);
  }
  G.removePick(W.phoneCam);
  await talk(MENTOR, "问题件全部闭环。下班前，把今天发现的<b>可以改进的地方</b>写下来——这是你答辩的素材。");
  finish();
}

// ============ 日终：优化提案 ============
async function taskEnd() {
  begin("end");
  G.mentor.at(1.6, 5.6, PI);
  await G.goto(ST.hall, "回到<b>驿站大厅</b>");
  stepOn(0);
  await talk(MENTOR, "下班前最后一件事是<b>日终盘点</b>：系统在库数要和货架上的实物数对得上，然后交接班。");
  device.show("pc", "驿站管理系统", `<div class="big">日终盘点</div><table><tr><td>系统在库</td><td><b>412</b> 件</td></tr><tr><td>实物清点</td><td><b>411</b> 件</td></tr><tr><td>差异</td><td class="err">-1 件</td></tr></table>`, [], { bar: "盘点" });
  await order("实物比系统少 1 件，按什么顺序排查？", ["核对今日出库记录，查有没有已交付却漏扫核销的件", "检查通道、问题件区、待上架笼车有没有遗漏", "按库位逐架复点", "仍找不到：调取监控追溯，登记差异并上报站长"], ["直接在系统里把在库数改成 411"], { dim: "exc", err: "盘点差异排查顺序", explain: "先查最常见的原因（漏扫核销、放错地方），再逐架复点，最后调监控并上报。<b>不能私自改系统数据</b>。" });
  device.hide();
  await ask("交接班时必须交代哪些事项？", ["未取件和超期件、未闭环的问题件、设备异常状态、当日盘点差异", "说一句“今天没什么事”就行", "只交代自己负责的那一部分"], 0, { dim: "biz", keepOrder: true, err: "交接班事项", explain: "交接班要让下一班<b>接得住</b>：在库与超期情况、问题件进度、设备状态、盘点差异都要交代清楚。" });
  stepOk(0);
  stepOn(1);
  const obs = ["入库台到件集中时堆积，扫描和验收一个人忙不过来", "取件高峰排队长，顾客报码 → 找件 → 核销耗时", "相似取件码多，容易拿错件", "面单褶皱、模糊导致反复重扫", "代取核验和登记全靠手工，效率低", "寄件验视、称重、打印分散在几处，来回走动", "智能柜柜门未关没人及时发现", "问题件靠纸质/表格台账，跟进容易遗漏"];
  const v = await form(`<div class="qt">流程观察与优化提案</div>
    <div style="font-size:13px;color:#5b6676;line-height:1.6">今天你在哪些环节遇到了<b>堵点、差错或等待</b>？勾选观察到的问题，再写一段你的<b>改进建议</b>（问题 → 原因 → 措施 → 预期效果）。</div>
    ${obs.map((o) => `<label class="ck"><input type="checkbox" name="obs" value="${o}">${o}</label>`).join("")}
    <textarea name="txt" placeholder="例：取件高峰时找件慢（问题），因为相似取件码多、货架层位标签小（原因）。建议按取件码尾号再细分格位、加大标签字号，并在终端上显示货架示意图（措施），预计找件时间缩短一半、拿错件减少（效果）。"></textarea>`, "提交提案", (x) => (x.txt.length < 20 ? "建议至少写 20 个字" : ""));
  const txt = v.txt;
  let s = Math.min(50, (txt.length / 120) * 50);
  if (/堵|排队|拥|等待|耗时|慢|效率|错|漏|找不到|混乱|重复|遗漏|来回/.test(txt)) s += 15;
  if (/因为|原因|由于|导致/.test(txt)) s += 10;
  if (/建议|优化|增加|调整|改为|设置|采用|引入|培训|划分|规范|提前|合并|分流/.test(txt)) s += 15;
  if (/预计|效果|缩短|减少|提高|提升|降低/.test(txt)) s += 10;
  score.prop = Math.round(Math.min(100, s + Math.min(10, (v.obs || []).length * 3)));
  score.propText = txt; score.propObs = v.obs || [];
  toast(`提案已提交（质量评分 ${score.prop}）`, "ok");
  stepOk(1);
  stepOn(2);
  stepOk(2);
  finish();
}

// ============ 结算 ============
function report(forced) {
  const v = score.calc();
  const g = grade(v.total);
  try { parent.postMessage({ type: "tp:score", score: Math.round(v.total), max: 100, detail: { dims: Object.fromEntries(DIMS.map((d) => [d.k, Math.round(v[d.k])])), done: Object.keys(state.done) } }, "*"); } catch { /* 独立打开时没有平台 */ }
  const allDone = TASKS.every((t) => state.done[t.id]);
  if (allDone) { try { parent.postMessage({ type: "tp:complete" }, "*"); } catch { /* 同上 */ } }
  if (!forced && !allDone) return;
  const errs = score.log.filter((l) => !l.ok);
  const card = overlay.show(`<span class="tag2">结算 · 上岗准备度</span><h1>今日实训报告</h1>
    <div class="gradebox"><div class="g" style="color:${{ A: "#1f9d55", B: "#2f6fed", C: "#d97706", D: "#d64545" }[g.g]}">${g.g}</div><div><div class="s">${Math.round(v.total)} <span style="font-size:15px;color:#5b6676">/ 100</span></div><b>${g.t}</b><div style="font-size:13px;color:#334155">${g.d}</div></div></div>
    <div class="bars">${DIMS.map((d) => `<div class="row"><span>${d.n}<small style="color:#8a94a3"> ${d.w}%</small></span><div class="bar"><i style="width:${Math.round(v[d.k])}%"></i></div><b>${Math.round(v[d.k])}</b></div>`).join("")}</div>
    <h2>岗位任务</h2><div style="font-size:14px;line-height:1.9">${TASKS.map((t) => `${state.done[t.id] ? "✅" : "⬜"} ${t.full}（${t.role}）`).join("<br>")}</div>
    ${allDone ? "" : '<p style="color:#d97706">还有任务没完成，“流程完整性”会偏低。完成全部岗位任务后再结算，平台保留最高分。</p>'}
    <h2>差错清单（${errs.length}）</h2>${errs.length ? `<ol class="errs">${errs.map((e) => `<li>${esc(e.msg)}　<small style="color:#8a94a3">${TASKS.find((t) => t.id === e.task)?.name || ""}</small></li>`).join("")}</ol>` : "<p>没有差错，漂亮！</p>"}
    ${score.propText ? `<h2>你的优化提案</h2><p style="background:#f5f7fb;border-radius:8px;padding:8px 12px">${esc(score.propText)}</p>` : ""}
    <p style="font-size:13px;color:#5b6676">评分口径与驿站实训考核一致：虚拟综合得分 ≥90 可直接上手，80～89 基本可上手，70～79 需带教，&lt;70 需补练。成绩已上报平台（保留最高分）。</p>
    <div class="row-btns"><button class="primary" id="rbBack">返回场景</button><button id="rbRestart">重新开始</button></div>`);
  card.querySelector("#rbBack").onclick = () => overlay.hide();
  card.querySelector("#rbRestart").onclick = () => location.reload();
}

// ============ 菜单 ============
const RUN = { prep: taskPrep, in: taskIn, shelf: taskShelf, out: taskOut, send: taskSend, exc: taskExc, end: taskEnd };
async function runTask(id) {
  if (state.running) return toast("先完成当前任务");
  overlay.hide();
  state.running = id;
  try { await RUN[id](); }
  catch (e) { console.error(e); toast("任务出错：" + e.message, "bad", 6000); }
  state.running = null;
}
async function runShift() {
  overlay.hide();
  for (const t of TASKS) {
    if (state.done[t.id]) continue;
    await runTask(t.id);
    if (!state.done[t.id]) return;
    if (t.id !== "end") await G.wait(600);
  }
  report(true);
}
function taskMenu() {
  const card = overlay.show(`<span class="tag2">按岗位角色进入</span><h1>选择岗位任务</h1>
    <p>推荐按顺序完成整个班次。也可以单独练某个岗位（前面环节会自动按标准结果补齐）。</p>
    <div class="grid2">${TASKS.map((t) => `<button class="tcard ${state.done[t.id] ? "done" : ""}" data-t="${t.id}"><span class="st">${state.done[t.id] ? "✅ 已完成" : state.running === t.id ? "进行中" : ""}</span><b>${t.name}</b><small>${t.role}${t.zone ? " · " + ZONES[t.zone].name : ""}<br>${t.steps.join(" → ")}</small></button>`).join("")}</div>
    <div class="row-btns"><button class="primary" id="mShift">从当前进度继续完整班次</button><button id="mClose">关闭</button></div>`);
  card.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
    const id = b.dataset.t;
    if (state.done[id]) return toast("这个任务已经完成了");
    if (state.running) return toast("先完成当前任务：" + TASKS.find((t) => t.id === state.running).name);
    runTask(id);
  }));
  card.querySelector("#mShift").onclick = () => { if (state.running) return toast("当前任务进行中"); runShift(); };
  card.querySelector("#mClose").onclick = () => overlay.hide();
}
function help() {
  const card = overlay.show(`<span class="tag2">操作说明</span><h1>怎么操作</h1>
    <p>🖱 <b>拖动画面</b>：转身、抬头低头。<br>⌨ <kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> 或方向键：走动；按住 <kbd>Shift</kbd> 快走。<br>👆 <b>点地面</b>：自动走过去；点<b>左下角小地图</b>也能走过去。<br>✨ <b>发蓝光的物体</b>：当前要操作的对象，点击即可。鼠标停在物体上会显示名称。<br>📟 右侧是设备屏幕（PDA、终端、快递柜、电脑），在上面输入和按键。<br>💬 底部是和顾客、导师的对话，选择你的回答。</p>
    <p>评分五个维度：流程完整性 25%、设备操作正确性 25%、业务准确率 25%、异常处置 15%、优化提案 10%。随时可以点「结算」看成绩，平台保留最高分。</p>
    <div class="row-btns"><button class="primary" id="hClose">知道了</button></div>`);
  card.querySelector("#hClose").onclick = () => overlay.hide();
}
function dex() {
  const card = overlay.show(`<span class="tag2">设备图鉴 · ${G.seenDev.size}/8 已认识</span><h1>驿站设备</h1><div class="dex">${DEVICES.map((d) => `<div class="d ${G.seenDev.has(d.key) ? "seen" : ""}"><b>${d.name}</b>　<small style="color:#5b6676">${ZONES[d.zone].name}</small><br>${d.use}<ol>${d.steps.map((s) => `<li>${s}</li>`).join("")}</ol><span style="color:#d64545">常见错误：</span>${d.errors.join("；")}</div>`).join("")}</div><div class="row-btns"><button class="primary" id="dClose">关闭</button></div>`);
  card.querySelector("#dClose").onclick = () => overlay.hide();
}
function start() {
  const card = overlay.show(`<span class="tag2">校园快递驿站岗位实践 · 虚拟预演</span>
    <h1>校园快递驿站 · 岗位实训仿真</h1>
    <p>进驿站实训之前，先在这个虚拟驿站里<b>跟一个完整班次</b>：认识五个作业区和 8 种设备，亲手完成<b>入库 → 上架 → 出库服务 → 寄件 → 问题件处理</b>，最后写一份流程优化提案。到了真驿站，直接上手。</p>
    <div class="grid2">${Object.values(ZONES).map((z) => `<div class="tcard" style="cursor:default"><b style="color:${z.color}">${z.name}</b><small>${z.duty}</small></div>`).join("")}</div>
    <p style="font-size:13px;color:#5b6676">操作：拖动画面环视，WASD/方向键走动，点地面自动走过去，点发光物体操作。建议<b>全屏</b>体验。成绩自动上报，平台保留最高分。</p>
    <div class="row-btns"><button class="primary" id="sShift">开始完整班次（推荐）</button><button id="sRole">按岗位选择任务</button><button id="sFree">先自由参观</button></div>`);
  card.querySelector("#sShift").onclick = () => runShift();
  card.querySelector("#sRole").onclick = () => taskMenu();
  card.querySelector("#sFree").onclick = () => { overlay.hide(); panel.instr("自由参观中：随意走走看看，点击设备可查看说明。准备好了点上方「岗位任务」。"); };
}

export function initTasks(g) {
  G = g; W = g.W;
  setupWorld();
  $("#bTasks").onclick = taskMenu;
  $("#bHelp").onclick = help;
  $("#bDex").onclick = dex;
  $("#bEnd").onclick = () => report(true);
  panel.setTask(null);
  start();
  // 调试与自动化测试用
  window.__station = { G, state, score, PM, ST, runTask };
}
