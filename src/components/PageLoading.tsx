// 页面切换时的即时反馈：顶部进度条 + 灰色占位方块
export function PageLoading() {
  return (
    <div role="status" aria-label="加载中" className="space-y-6">
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-brand-100">
        <div className="h-full w-1/3 animate-[loadbar_1.1s_ease-in-out_infinite] bg-brand-500" />
      </div>
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200/50" />
        ))}
      </div>
    </div>
  );
}
