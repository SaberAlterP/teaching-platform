// 行走网格：障碍物登记、碰撞检测、A* 寻路（点地面自动走过去、“自动前往”）
export class Grid {
  constructor(x0, z0, x1, z1, cs = 0.2) {
    this.x0 = x0; this.z0 = z0; this.cs = cs;
    this.w = Math.ceil((x1 - x0) / cs); this.h = Math.ceil((z1 - z0) / cs);
    this.blk = new Uint8Array(this.w * this.h);
  }
  ix(x) { return Math.floor((x - this.x0) / this.cs); }
  iz(z) { return Math.floor((z - this.z0) / this.cs); }
  // 登记一个矩形障碍（自动外扩人体半径）
  block(ax, az, bx, bz, pad = 0.24, v = 1) {
    const x0 = Math.min(ax, bx) - pad, x1 = Math.max(ax, bx) + pad, z0 = Math.min(az, bz) - pad, z1 = Math.max(az, bz) + pad;
    for (let i = Math.max(0, this.ix(x0)); i <= Math.min(this.w - 1, this.ix(x1)); i++)
      for (let j = Math.max(0, this.iz(z0)); j <= Math.min(this.h - 1, this.iz(z1)); j++) this.blk[j * this.w + i] = v;
  }
  // 以中心点和尺寸登记
  box(cx, cz, sx, sz, pad) { this.block(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, pad); }
  freeCell(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blk[j * this.w + i]; }
  free(x, z) { return this.freeCell(this.ix(x), this.iz(z)); }
  // 两点之间是否可直线通过
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (this.cs * 0.5));
    for (let k = 1; k <= n; k++) { const t = k / n; if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // 最近的可走格
  nearestFree(x, z) {
    if (this.free(x, z)) return [x, z];
    for (let r = 1; r < 30; r++) for (let a = 0; a < 16; a++) {
      const px = x + Math.cos(a / 16 * Math.PI * 2) * r * this.cs, pz = z + Math.sin(a / 16 * Math.PI * 2) * r * this.cs;
      if (this.free(px, pz)) return [px, pz];
    }
    return [x, z];
  }
  path(sx, sz, tx, tz) {
    [tx, tz] = this.nearestFree(tx, tz);
    [sx, sz] = this.nearestFree(sx, sz);
    const W = this.w, si = this.ix(sx), sj = this.iz(sz), ti = this.ix(tx), tj = this.iz(tz);
    if (!this.freeCell(ti, tj)) return null;
    const N = W * this.h, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; // 简单二叉堆 [f, idx]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const s = sj * W + si, t = tj * W + ti;
    g[s] = 0; push(0, s);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === t) { found = true; break; }
      closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      for (const [di, dj, c] of D) {
        const ni = ci + di, nj = cj + dj;
        if (!this.freeCell(ni, nj)) continue;
        if (di && dj && (!this.freeCell(ci + di, cj) || !this.freeCell(ci, cj + dj))) continue;
        const n = nj * W + ni, ng = g[cur] + c;
        if (ng < g[n]) { g[n] = ng; from[n] = cur; push(ng + Math.hypot(ti - ni, tj - nj), n); }
      }
    }
    if (!found) return null;
    const pts = [];
    for (let c = t; c !== -1; c = from[c]) pts.push([this.x0 + ((c % W) + 0.5) * this.cs, this.z0 + (((c / W) | 0) + 0.5) * this.cs]);
    pts.reverse();
    pts[0] = [sx, sz]; pts[pts.length - 1] = [tx, tz];
    // 拉直：能直线走到的点就跳过中间点
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let j = pts.length - 1;
      while (j > k + 1 && !this.los(pts[k][0], pts[k][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]); k = j;
    }
    return out;
  }
}
