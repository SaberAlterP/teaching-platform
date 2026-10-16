import fs from "fs";
import { describe, expect, it } from "vitest";
import { reviewScene, sanitizeScene, type Tp3dStats } from "@/lib/ai/scene-check";
import { staticCheck } from "@/lib/ai/workspace";

const HEAD = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">`;
const MAP = `<script type="importmap">{"imports":{"three":"/lib/three/three.module.js","three/addons":"/lib/three/addons.js","tp3d":"/lib/tp3d/tp3d.js"}}</script>`;
const tp3dPage = (map = MAP) => `${HEAD}${map}</head><body><script type="module">import * as T from "tp3d";\nconst app = T.createApp({});\n</script></body></html>`;

const rich: Tp3dStats = { parts: 1100, kinds: ["warehouse", "truck", "forklift", "person", "zone", "rack", "tree", "cone", "van"], triangles: 40000, labels: 6, zones: 12, ambient: 20, steps: 4, asks: 3, questions: 5, tasks: 1, fps: 60, lite: false };

describe("3D 画面丰富度检查", () => {
  it("浏览器传来的统计只保留认识的字段，数字截断", () => {
    const s = sanitizeScene({ frames: "12", triangles: -5, draws: 1e12, evil: "x", tp3d: { parts: 3.7, kinds: ["truck", 1, "a".repeat(100)], lite: "yes" } });
    expect(s?.frames).toBe(12);
    expect(s?.triangles).toBe(0);
    expect(s?.draws).toBe(1e9);
    expect(s?.tp3d?.parts).toBe(4);
    expect(s?.tp3d?.kinds).toEqual(["truck", "a".repeat(30)]);
    expect(s?.tp3d?.lite).toBe(false);
    expect(sanitizeScene(null)).toBeNull();
    expect(sanitizeScene("x")).toBeNull();
  });

  it("零件太少报“画面太空”，丰富的场景不报", () => {
    const empty = reviewScene(tp3dPage(), { frames: 50, triangles: 3000, draws: 20, tp3d: { ...rich, parts: 120, kinds: ["truck", "zone"] } });
    expect(empty.problems.some((p) => p.includes("画面太空"))).toBe(true);
    const ok = reviewScene(tp3dPage(), { frames: 50, triangles: 40000, draws: 200, tp3d: rich });
    expect(ok.problems).toEqual([]);
    expect(ok.checklist.length).toBeGreaterThan(5);
    expect(ok.checklist.every((c) => c.startsWith("✓"))).toBe(true);
  });

  it("自查清单标出缺的项目：没有分区、没有小问、没有步骤", () => {
    const r = reviewScene(tp3dPage(), { frames: 50, triangles: 40000, draws: 200, tp3d: { ...rich, zones: 1, asks: 0, steps: 0 } });
    expect(r.checklist.filter((c) => c.startsWith("✗")).length).toBe(3);
    expect(r.problems.some((p) => p.includes("没有讲解步骤"))).toBe(true);
  });

  it("没用 tp3d 的 3D 页面按每帧三角形数判断，并建议改用 tp3d", () => {
    const html = `${HEAD}<script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script></head><body><script type="module">import * as THREE from "three";</script></body></html>`;
    const r = reviewScene(html, { frames: 30, triangles: 2000, draws: 10, tp3d: null });
    expect(r.problems.some((p) => p.includes("画面太空"))).toBe(true);
    expect(r.tips.some((t) => t.includes("tp3d"))).toBe(true);
  });

  it("预览在后台没渲染、或老师没开预览时不误报", () => {
    expect(reviewScene(tp3dPage(), { frames: 0, triangles: 0, draws: 0, tp3d: null }).problems).toEqual([]);
    expect(reviewScene(tp3dPage(), null).problems).toEqual([]);
  });

  it("2D 动画不做 3D 检查", () => {
    expect(reviewScene(`${HEAD}</head><body><canvas></canvas></body></html>`, null)).toEqual({ problems: [], tips: [], checklist: [] });
  });

  it("用了 tp3d 但 importmap 漏了 tp3d：静态检查直接报错（不能发布）", () => {
    const bad = tp3dPage(`<script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script>`);
    expect(staticCheck(bad).problems.some((p) => p.includes("tp3d"))).toBe(true);
    const good = staticCheck(tp3dPage());
    expect(good.problems).toEqual([]);
    // tp3d 自动上报成绩，不再提示缺 tp:score
    expect(good.tips.some((t) => t.includes("tp:score"))).toBe(false);
  });

  it("技能里的两个 3D 范例能通过静态检查", () => {
    for (const f of ["src/lib/ai/template-3d.html", "src/lib/ai/template-3d-air.html"]) {
      const r = staticCheck(fs.readFileSync(f, "utf8"));
      expect(r.problems, f).toEqual([]);
    }
  });
});
