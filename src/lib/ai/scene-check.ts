// 3D 动画的“画面丰富度”检查和自查清单（给 AI 的 html_check 用）。
// 数据来自老师浏览器里的草稿预览：tp3d 部件库的统计（window.__tp3d.stats()），以及通用的 WebGL 每帧三角形数。
// 纯函数，不碰数据库，tests/scene-check.test.ts 有测试。

export type Tp3dStats = {
  parts: number; // 零件数（每个小零件算 1 个）
  kinds: string[]; // 用到的部件种类
  triangles: number;
  labels: number;
  zones: number; // 地面、地面分区、标线、道路
  ambient: number; // 氛围动效（云、鸟、树、循环车辆、会动的设备）
  steps: number;
  asks: number; // 讲解步骤里的随堂小问
  questions: number; // 全部题目（含小问）
  tasks: number; // 实训评分项
  fps: number;
  lite: boolean;
};
export type SceneStats = { frames: number; triangles: number; draws: number; tp3d: Tp3dStats | null };

const num = (v: unknown, max = 1e9) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0;
};

// 浏览器传上来的数据不可信：只取认识的字段、数字截断、数组限长
export function sanitizeScene(raw: unknown): SceneStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let tp3d: Tp3dStats | null = null;
  if (r.tp3d && typeof r.tp3d === "object") {
    const t = r.tp3d as Record<string, unknown>;
    tp3d = {
      parts: num(t.parts), triangles: num(t.triangles), labels: num(t.labels, 1e5), zones: num(t.zones, 1e5), ambient: num(t.ambient, 1e5),
      steps: num(t.steps, 1000), asks: num(t.asks, 1000), questions: num(t.questions, 1000), tasks: num(t.tasks, 1000), fps: num(t.fps, 1000),
      lite: t.lite === true,
      kinds: Array.isArray(t.kinds) ? t.kinds.filter((k): k is string => typeof k === "string").slice(0, 60).map((k) => k.slice(0, 30)) : [],
    };
  }
  return { frames: num(r.frames), triangles: num(r.triangles), draws: num(r.draws), tp3d };
}

export const is3d = (html: string) => /["']three["']\s*:/.test(html) || /from\s*["']three["']/.test(html);
export const usesTp3d = (html: string) => /from\s*["']tp3d["']/.test(html);

// 返回：problems（必须修）、tips（建议）、checklist（自查清单，每项 ✓/✗ 开头）
export function reviewScene(html: string, scene: SceneStats | null) {
  const problems: string[] = [];
  const tips: string[] = [];
  const checklist: string[] = [];
  if (!is3d(html)) return { problems, tips, checklist };
  const tp = usesTp3d(html);
  if (!tp) tips.push("这是 3D 动画但没有用平台的 tp3d 部件库：车辆、飞机、货架、人物、厂房等都有现成的精细部件，按「3D场景」技能改用 tp3d，画面会精细很多");

  const mark = (ok: boolean, text: string) => checklist.push(`${ok ? "✓" : "✗"} ${text}`);
  const s = scene?.tp3d;
  if (!scene) {
    tips.push("没有拿到预览画面的统计（老师没打开预览），画面丰富度没检查");
  } else if (!scene.frames) {
    tips.push("预览页面在后台没有渲染，画面丰富度没检查；可以稍后再 html_check 一次");
  } else if (s) {
    const kinds = s.kinds.length;
    if (s.parts < 250 || kinds < 5) problems.push(`画面太空：只有 ${s.parts} 个零件、${kinds} 种部件。照「场景清单」补齐厂房/车辆/设备/货物/人物，加地面分区和标线、树和灯杆等环境小品（参考范例一般 800 个零件以上、12 种部件以上）`);
    else if (s.parts < 500 || kinds < 8) tips.push(`画面偏空（${s.parts} 个零件、${kinds} 种部件），建议再补一些设备、货物、人物和环境小品`);
    mark(kinds >= 8, `部件种类 ${kinds} 种（建议 ≥ 8）：${s.kinds.slice(0, 20).join("、") || "无"}`);
    mark(s.zones >= 4, `地面分区与标线 ${s.zones} 处（建议 ≥ 4，用 zone / markLine / road / arrow）`);
    mark(s.ambient >= 3, `氛围动效 ${s.ambient} 个（云、鸟、树、循环行驶的车辆、走动的人，建议 ≥ 3）`);
    mark(s.labels >= 3, `3D 标注 ${s.labels} 个（关键设备、区域要有标签，建议 ≥ 3）`);
    mark(s.steps >= 3, `讲解步骤 ${s.steps} 步（建议 3~8 步）`);
    mark(s.asks >= 1, `步骤中的随堂小问 ${s.asks} 道（建议 ≥ 2）`);
    mark(s.questions - s.asks >= 1, `额外题 ${s.questions - s.asks} 道（拓展、计算或情境判断，建议 1~2 道）`);
    mark(s.questions + s.tasks > 0, `成绩上报：${s.questions + s.tasks > 0 ? "有小题/实训，tp3d 会自动上报 tp:score 和 tp:complete" : "没有任何题目或实训"}`);
    if (s.lite) tips.push(`预览时帧率偏低（约 ${s.fps} 帧/秒），已自动降级；学生电脑可能更卡，零件特别多时考虑减少远景物体`);
    if (s.steps === 0) problems.push("没有讲解步骤：用 app.steps([...]) 做分步讲解（每步有字幕，可暂停、上一步、下一步）");
    if (s.questions === 0 && s.tasks === 0) problems.push("没有小题也没有实训：用 app.quiz([...]) 或步骤里的 ask 出题，成绩才会上报");
  } else {
    // 没用 tp3d：只能用每帧画的三角形数粗略判断
    if (scene.triangles < 8000) problems.push(`画面太空：每帧只画了约 ${scene.triangles} 个三角形。场景缺少细节，改用 tp3d 部件库搭场景，或给模型加更多零件、地面分区和环境小品`);
    else if (scene.triangles < 20000) tips.push(`画面偏简单（每帧约 ${scene.triangles} 个三角形），建议补充细节`);
    mark(/tp:score/.test(html), "成绩上报 tp:score");
    mark(/(cloud|云|bird|鸟)/i.test(html), "氛围动效（云、鸟、车流等）");
    mark(/CSS2DObject/.test(html), "3D 标注（CSS2DObject）");
  }
  return { problems, tips, checklist };
}
