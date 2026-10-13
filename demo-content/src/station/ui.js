// 界面：任务面板、判断题、排序题、对话、设备屏幕、提示与计分
import { DIMS, TASKS } from "./data.js";

export const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- 声音（PDA 提示音） ----------
let actx = null;
export function beep(ok = true) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const seq = ok ? [[2200, 0.08]] : [[420, 0.12], [0, 0.05], [420, 0.12]];
    let t = actx.currentTime;
    for (const [f, d] of seq) {
      if (f) { const o = actx.createOscillator(), g = actx.createGain(); o.type = ok ? "sine" : "square"; o.frequency.value = f; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d); }
      t += d;
    }
  } catch { /* 没有声音也不影响 */ }
}

// ---------- 计分 ----------
export const score = {
  dims: { dev: [0, 0], biz: [0, 0], exc: [0, 0] }, // [正确, 总数]
  steps: {}, // taskId -> 已完成步骤数
  log: [], // { task, dim, ok, msg }
  prop: 0, propText: "",
  task: null,
  rec(dim, ok, msg) {
    const d = this.dims[dim]; d[1]++; if (ok) d[0]++;
    this.log.push({ task: this.task, dim, ok, msg });
  },
  calc() {
    const total = TASKS.reduce((s, t) => s + t.steps.length, 0);
    const done = Object.values(this.steps).reduce((s, n) => s + n, 0);
    const v = {
      proc: (done / total) * 100,
      dev: this.dims.dev[1] ? (this.dims.dev[0] / this.dims.dev[1]) * 100 : 0,
      biz: this.dims.biz[1] ? (this.dims.biz[0] / this.dims.biz[1]) * 100 : 0,
      exc: this.dims.exc[1] ? (this.dims.exc[0] / this.dims.exc[1]) * 100 : 0,
      prop: this.prop,
    };
    v.total = DIMS.reduce((s, d) => s + (v[d.k] * d.w) / 100, 0);
    return v;
  },
};

// ---------- 提示 ----------
export function toast(msg, kind = "", ms = 3200) {
  // 同样的提示正在显示时不重复堆叠
  for (const x of $("#toast").children) if (x.innerHTML === msg) return;
  const d = document.createElement("div");
  d.className = kind; d.innerHTML = msg;
  $("#toast").appendChild(d);
  setTimeout(() => d.remove(), ms);
}

// ---------- 任务面板 ----------
export const panel = {
  setTask(t) {
    $("#taskName").textContent = t ? t.full : "自由参观";
    $("#taskRole").textContent = t ? `岗位：${t.role}${t.zone ? " · 作业区 " + t.zone : ""}` : "点「岗位任务」开始一个班次";
    $("#steps").innerHTML = t ? t.steps.map((s) => `<li>${esc(s)}</li>`).join("") : "";
    this.instr(""); this.btns([]); $("#qbox").innerHTML = "";
  },
  step(i, state) {
    const li = $("#steps").children[i];
    if (!li) return;
    li.className = state;
  },
  instr(html) { $("#instr").innerHTML = html; },
  btns(list) {
    const box = $("#instrBtns"); box.innerHTML = "";
    for (const b of list) {
      const el = document.createElement("button");
      el.textContent = b.label; if (b.primary) el.className = "primary";
      el.onclick = b.fn; box.appendChild(el);
    }
  },
};

// 判断/选择题：opts 为字符串数组；correct 为正确下标（数组表示多个都算对）
// 返回 { i, ok }
export function ask(q, opts, correct, o = {}) {
  return new Promise((res) => {
    const box = $("#qbox");
    const wrap = document.createElement("div"); wrap.className = "q";
    wrap.innerHTML = `<div class="qt">${q}</div>`;
    const order = o.keepOrder ? opts.map((_, i) => i) : shuffle(opts.map((_, i) => i));
    const ok = (i) => (Array.isArray(correct) ? correct.includes(i) : i === correct);
    const btns = [];
    for (const i of order) {
      const b = document.createElement("button"); b.className = "opt"; b.innerHTML = opts[i];
      b.onclick = () => {
        btns.forEach((x) => (x.disabled = true));
        const good = ok(i);
        b.classList.add(good ? "right" : "wrong");
        if (!good) btns.forEach((x) => { if (ok(+x.dataset.i)) x.classList.add("right"); });
        if (o.dim) score.rec(o.dim, good, o.err || q.replace(/<[^>]+>/g, ""));
        if (!good) toast("✘ " + (o.errToast || "不对，看看正确做法"), "bad", 2200);
        else if (!o.silent) toast("✔ 正确", "ok", 1400);
        const ex = typeof o.explain === "function" ? o.explain(i, good) : o.explain;
        const next = () => { wrap.remove(); res({ i, ok: good }); };
        if (ex || !good) {
          const e = document.createElement("div"); e.className = "explain " + (good ? "good" : "bad"); e.innerHTML = ex || "";
          if (ex) wrap.appendChild(e);
          const c = document.createElement("button"); c.className = "primary"; c.textContent = "继续"; c.onclick = next;
          wrap.appendChild(c);
        } else setTimeout(next, 650);
      };
      b.dataset.i = i; btns.push(b); wrap.appendChild(b);
    }
    box.innerHTML = ""; box.appendChild(wrap);
    box.scrollIntoView?.({ block: "nearest" });
  });
}

// 排序题：items 为正确顺序；distract 为干扰项。返回是否完全正确
export function order(q, items, distract = [], o = {}) {
  return new Promise((res) => {
    const box = $("#qbox");
    const wrap = document.createElement("div"); wrap.className = "q";
    wrap.innerHTML = `<div class="qt">${q}</div><div class="tip" style="font-size:12px;color:#5b6676">依次点击步骤排出顺序（干扰项不要选）</div>`;
    const seq = document.createElement("div"); seq.className = "seq";
    const chips = document.createElement("div"); chips.className = "chips";
    const picked = [];
    const all = shuffle([...items, ...distract]);
    const render = () => {
      seq.innerHTML = picked.length ? picked.map((s, i) => `<span>${i + 1}. ${s}</span>`).join("") : '<span style="background:none;color:#8a94a3">（点击下方步骤）</span>';
      chips.innerHTML = "";
      for (const s of all) {
        if (picked.includes(s)) continue;
        const b = document.createElement("button"); b.textContent = s;
        b.onclick = () => { picked.push(s); render(); };
        chips.appendChild(b);
      }
    };
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;margin-top:6px";
    const undo = document.createElement("button"); undo.textContent = "撤销一步"; undo.onclick = () => { picked.pop(); render(); };
    const sub = document.createElement("button"); sub.textContent = "提交"; sub.className = "primary";
    sub.onclick = () => {
      if (picked.length < 2) return toast("至少排出两步再提交");
      const good = picked.length === items.length && picked.every((s, i) => s === items[i]);
      if (o.dim) score.rec(o.dim, good, o.err || q);
      toast(good ? "✔ 顺序正确" : "✘ 顺序有误", good ? "ok" : "bad", 1600);
      chips.remove(); row.remove();
      const e = document.createElement("div"); e.className = "explain " + (good ? "good" : "bad");
      e.innerHTML = (good ? "" : "<b>正确顺序：</b><br>" + items.map((s, i) => `${i + 1}. ${s}`).join("<br>")) + (o.explain ? (good ? "" : "<br>") + o.explain : "");
      wrap.appendChild(e);
      const c = document.createElement("button"); c.className = "primary"; c.textContent = "继续"; c.onclick = () => { wrap.remove(); res(good); };
      wrap.appendChild(c);
    };
    row.append(undo, sub);
    wrap.append(seq, chips, row);
    box.innerHTML = ""; box.appendChild(wrap);
    render();
  });
}

// 表单（台账、提案等）：html 内含 name 字段，返回字段值
export function form(html, submitLabel = "提交", check) {
  return new Promise((res) => {
    const box = $("#qbox");
    const wrap = document.createElement("div"); wrap.className = "q";
    wrap.innerHTML = html;
    const b = document.createElement("button"); b.className = "primary"; b.textContent = submitLabel; b.style.marginTop = "8px";
    b.onclick = () => {
      const v = {};
      wrap.querySelectorAll("[name]").forEach((el) => { v[el.name] = el.type === "checkbox" ? (v[el.name] || []).concat(el.checked ? [el.value] : []) : el.value.trim(); });
      const msg = check && check(v);
      if (msg) return toast(msg, "bad");
      wrap.remove(); res(v);
    };
    wrap.appendChild(b);
    box.innerHTML = ""; box.appendChild(wrap);
  });
}

// ---------- 对话 ----------
// 无选项：显示“继续”；有选项：返回所选下标
export function talk(who, text, opts) {
  return new Promise((res) => {
    const d = $("#dialog"); d.hidden = false;
    d.querySelector(".who").textContent = who;
    d.querySelector(".say").innerHTML = text;
    const box = d.querySelector(".opts"); box.innerHTML = "";
    const close = (v) => { d.hidden = true; res(v); };
    if (!opts) {
      const b = document.createElement("button"); b.className = "primary cont"; b.textContent = "继续 ▶"; b.onclick = () => close(-1);
      box.appendChild(b);
    } else {
      const order = shuffle(opts.map((_, i) => i));
      for (const i of order) { const b = document.createElement("button"); b.innerHTML = opts[i]; b.onclick = () => close(i); box.appendChild(b); }
    }
  });
}
export function hideTalk() { $("#dialog").hidden = true; }

// ---------- 设备屏幕 ----------
// kind：pda / kiosk / pc / locker / plain；keys：[{act,label,cls}]
let devResolve = null;
export const device = {
  show(kind, title, screenHtml, keys = [], o = {}) {
    const d = $("#device"); d.hidden = false; d.dataset.dex = o.dex ? "1" : "";
    devResolve = null;
    const keyHtml = keys.map((k) => `<button data-act="${k.act}" class="${k.cls || ""}" disabled>${k.label}</button>`).join("");
    d.innerHTML = `<div class="dev-title">${title}${o.tag ? `<span class="tag">${o.tag}</span>` : ""}</div>
      <div class="frame ${kind}">${kind === "pda" ? '<div class="scan-head"></div>' : ""}
        <div class="scr">${o.bar ? `<div class="bar"><span>${o.bar}</span><span>${o.barR || ""}</span></div>` : ""}<div class="in">${screenHtml}</div></div>
        ${keys.length ? `<div class="keys">${keyHtml}</div>` : ""}
      </div>${o.foot ? `<div style="font-size:12px;color:#5b6676;margin-top:6px;line-height:1.6">${o.foot}</div>` : ""}`;
    d.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
      if (!devResolve) return;
      const v = {};
      d.querySelectorAll("[name]").forEach((el) => (v[el.name] = el.value.trim()));
      d.querySelectorAll("[data-act]").forEach((x) => (x.disabled = true)); // 用过的按键变灰，避免误以为还能操作
      const r = devResolve; devResolve = null; r({ act: b.dataset.act, v });
    }));
    // 数字小键盘
    d.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => {
      const inp = d.querySelector(b.closest(".pad").dataset.for);
      if (!inp) return;
      const k = b.dataset.k;
      if (k === "del") inp.value = inp.value.slice(0, -1); else if (k === "clr") inp.value = ""; else inp.value += k;
      inp.dispatchEvent(new Event("input"));
    }));
    const f = d.querySelector("input"); if (f && !o.noFocus) setTimeout(() => f.focus(), 50);
    return d;
  },
  wait() { $("#device").querySelectorAll("[data-act]").forEach((x) => (x.disabled = false)); return new Promise((r) => (devResolve = r)); },
  async run(kind, title, html, keys, o) { this.show(kind, title, html, keys, o); return this.wait(); },
  hide() { $("#device").hidden = true; devResolve = null; },
  busy() { return !!devResolve && $("#device").dataset.dex !== "1"; },
  el() { return $("#device"); },
};
export function padHtml(target, keys = "123456789-0") {
  return `<div class="pad" data-for="${target}">${[...keys].map((k) => `<button data-k="${k}">${k}</button>`).join("")}<button data-k="del">⌫</button></div>`;
}

// ---------- 弹层 ----------
export const overlay = {
  show(html) { $("#ovCard").innerHTML = html; $("#overlay").hidden = false; return $("#ovCard"); },
  hide() { $("#overlay").hidden = true; },
  get open() { return !$("#overlay").hidden; },
};
export { esc };
