"use client";

// 一键展开 / 收起页面上所有模块分组
export function ExpandAll() {
  const set = (open: boolean) =>
    document.querySelectorAll<HTMLDetailsElement>("details[data-section]").forEach((d) => (d.open = open));
  return (
    <div className="flex gap-1 text-sm">
      <button type="button" onClick={() => set(true)} className="btn-ghost rounded-lg px-2.5 py-1">全部展开</button>
      <button type="button" onClick={() => set(false)} className="btn-ghost rounded-lg px-2.5 py-1">全部收起</button>
    </div>
  );
}
